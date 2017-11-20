var cheerio = require('cheerio');
var express = require('express');
var FeedParser = require('feedparser');
var _ = require('lodash');
var pug = require('pug');
var request = require('request');
var sio = require('socket.io');

var verbose = true;
var timeBetweenRetriesInMs = 500;
var fifteenMinInMs = 15 * 60 * 1000;
var numberOfRetries = fifteenMinInMs / timeBetweenRetriesInMs;
var checkingFeedEvent = 'checkingFeed';
var foundLinkEvent = 'foundLink';
var standardMessageEvent = 'message';
var redirect = 'redirect';
var activeSockets = {};

function checkFeed(count, socket) {
    if (!activeSockets[socket.id]) {
        console.log('Connection was already closed.');
        return;
    }

    if (count >= numberOfRetries) {
        output('Reached maximum number of retries: ' + numberOfRetries + '. If you want to keep trying, please refresh.', 
        checkingFeedEvent, socket);
        return;
    }

    output('Checking PAWS website feed... ' + count, checkingFeedEvent, socket);
    var feedRequest = request('https://surgicalopportunitiesscheduler.wordpress.com/feed/');
    var feedparser = new FeedParser();

    feedRequest.on('error', function (error) {
        output(error, standardMessageEvent, socket);
    });

    feedRequest.on('response', function (response) {
        var stream = this;

        if (response.statusCode !== 200) {
            this.emit('error', new Error('Bad status code'));
        } else {
            stream.pipe(feedparser);
        }
    });

    feedparser.on('error', function (error) {
        output(error, standardMessageEvent, socket);
    });

    var linkFound = false;
    feedparser.on('readable', function () {
        var stream = this;
        var post;
        var paragraphsWithSignUpLinks = [];
        while (post = stream.read()) {
            if (wasPostedToday(post)) {
                paragraphsWithSignUpLinks = findParagraphsWithLinks(post);
                if (paragraphsWithSignUpLinks && paragraphsWithSignUpLinks.length > 0) {
                    linkFound = true;
                    output(createFoundLinkMessage(post, paragraphsWithSignUpLinks), foundLinkEvent, socket);
                    openFormIfPossible(paragraphsWithSignUpLinks, socket);
                } else {
                    output(createPostWithoutLinkMessage(post), standardMessageEvent, socket);
                }
            }
        }
    });

    feedparser.on('end', function () {
        if (!linkFound) {
            output('Nothing yet...' + count, standardMessageEvent, socket);
            if (count < numberOfRetries) {
                setTimeout(() => { checkFeed(count+1, socket); }, timeBetweenRetriesInMs);
            }
        }
    });
}

function wasPostedToday(feedParserItem) {
    var currentDate = new Date();
    var postDate = new Date(feedParserItem.date);

    return currentDate.toDateString() === postDate.toDateString();
}

function findParagraphsWithLinks(feedParserItem) {
    if (feedParserItem.title && feedParserItem.title.indexOf('Sign Up') != -1) {
        var $ = cheerio.load(feedParserItem.description);
        var paragraphs = $('p').toArray();
        return _.filter(paragraphs, paragraph => $(paragraph).children('a').length > 0);
    }
    return null;
}

function openFormIfPossible(paragraphsWithSignUpLinks, socket) {
    var $ = cheerio.load(_.last(paragraphsWithSignUpLinks));
    output($('a').last().attr('href'), redirect, socket);
}

function createFoundLinkMessage(post, paragraphs) {
    var message = 'Post: <a target="_blank" href="' + post.link + '">' + post.title + '</a></br /><br />';
    var messageStrings = _.map(paragraphs, paragraph => {
        var $ = cheerio.load(paragraph);
        $('a').attr('style', 'font-size:30;background-color:pink;');
        return $('p').html();
    });
    return message + _.reduce(messageStrings, (message, part) => message + part + '<br />');
}

function createPostWithoutLinkMessage(post) {
    return 'Found post from today, but no sign up link :( <br /> Post: <a target="_blank" href="' + post.link + '">' + post.title 
        + '</a></br /><br />';
}

function output(message, event, socket) {
    if (verbose) {
        console.log(message);
    }
    socket.emit(event, message);
}

var app = express();
var server = require('http').createServer(app);
var io = sio.listen(server);

app.set('view engine', 'pug');

app.get('/', function (req, res) {
    res.render('index', { title: 'HAX for Michelle', header: "Ok, let's try to get you signed up..." });
});

io.sockets.on('connection', function (socket) {
    console.log('connection established');
    activeSockets[socket.id] = true;
    console.log(activeSockets);

    setTimeout(() => {
        checkFeed(0, socket);
    }, timeBetweenRetriesInMs);
        
    socket.on('disconnect', function () {
        console.log('connection closed');
        activeSockets[socket.id] = false;
        console.log(activeSockets);
    });
});

server.listen(process.env.port || 3000, function () {
    console.log('Server is running...');
});
