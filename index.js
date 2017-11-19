var cheerio = require('cheerio');
var express = require('express');
var SSE = require('express-sse');
var FeedParser = require('feedparser');
var _ = require('lodash');
var pug = require('pug');
var request = require('request');

var verbose = true;
var timeBetweenRetriesInMs = 500;
var fifteenMinInMs = 15 * 60 * 1000;
var numberOfRetries = fifteenMinInMs / timeBetweenRetriesInMs;
var checkingFeedEvent = 'checkingFeed';
var foundLinkEvent = 'foundLink';
var standardMessageEvent = 'message';
var redirect = 'redirect';

function checkFeed(count) {
    if (isNaN(count)) {
        count = 0;
    }

    if (count >= numberOfRetries) {
        output('Reached maximum number of retries: ' + numberOfRetries + '. If you want to keep trying, please refresh.', checkingFeedEvent);
        return;
    }

    output('Checking PAWS website feed... ' + count, checkingFeedEvent);
    var feedRequest = request('https://surgicalopportunitiesscheduler.wordpress.com/feed/');
    var feedparser = new FeedParser();

    feedRequest.on('error', function (error) {
        output(error, standardMessageEvent);
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
        output(error, standardMessageEvent);
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
                    output(createFoundLinkMessage(post, paragraphsWithSignUpLinks), foundLinkEvent);
                    openFormIfPossible(paragraphsWithSignUpLinks);
                } else {
                    output(createPostWithoutLinkMessage(post), standardMessageEvent);
                }
            }
        }
    });

    feedparser.on('end', function () {
        if (!linkFound) {
            output('Nothing yet...' + count, standardMessageEvent);
            if (count < numberOfRetries) {
                setTimeout(() => { checkFeed(count+1); }, timeBetweenRetriesInMs);
            }
        }
    });
}

function wasPostedToday(feedParserItem) {
    var currentDate = new Date("November 18, 2017 11:13:00");
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

function openFormIfPossible(paragraphsWithSignUpLinks) {
    var $ = cheerio.load(_.last(paragraphsWithSignUpLinks));
    output($('a').last().attr('href'), redirect);
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

function output(message, event) {
    if (verbose) {
        console.log(message);
    }
    sse.send(message, event);
}

var sse = new SSE();
var app = express();
app.set('view engine', 'pug');

app.get('/stream', sse.init);

app.get('/', function (req, res) {
    res.render('index', { title: 'HAX for Michelle', header: "Ok, let's try to get you signed up..." });
    setTimeout(checkFeed, timeBetweenRetriesInMs);
});

app.listen(process.env.port || 3000, function () {
    console.log('Server is running...');
});
