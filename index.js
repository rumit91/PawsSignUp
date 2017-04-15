var cheerio = require('cheerio');
var express = require('express');
var SSE = require('express-sse');
var FeedParser = require('feedparser');
var _ = require('lodash');
var pug = require('pug');
var request = require('request');

var sse = new SSE();
var app = express();
app.set('view engine', 'pug');

app.get('/stream', sse.init);

app.get('/', function (req, res) {
    res.render('index', { title: 'HAX for Michelle', header: "Ok, let's try to get you signed up..." });
    setTimeout(checkFeed, 500);  
});

app.listen(3000, function () {
    console.log('Server is running...');
});


var numberOfRetries = 10000; // This will give us at least an hour's worth of trying.
var checkingFeedEvent = 'checkingFeed';
var foundLinkEvent = 'foundLink';
var standardMessageEvent = 'message';

function checkFeed(count) {
    if (isNaN(count)) {
        count = 0;
    }

    if (count >= numberOfRetries) {
        sse.send('Reached maximum number of retries: ' + numberOfRetries + '. If you want to keep trying, please refresh.', checkingFeedEvent);
        return;
    }

    sse.send('Checking PAWS website feed... ' + count, checkingFeedEvent);
    var feedRequest = request('https://surgicalopportunitiesscheduler.wordpress.com/feed/');
    var feedparser = new FeedParser();

    feedRequest.on('error', function (error) {
        sse.send(error, standardMessageEvent);
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
        sse.send(error, standardMessageEvent);
    });

    var linkFound = false;
    feedparser.on('readable', function () {
        var stream = this; 
        var post;
        while (post = stream.read()) {
            if (wasPostedToday(post)) {
                var signUpLink = findLink(post);
                if (signUpLink) {
                    linkFound = true;
                    sse.send(findLink(post), foundLinkEvent);
                } else {
                    sse.send('Found post from today, but no sign up link :(', standardMessageEvent);
                }
            }
        }
    });

    feedparser.on('end', function () {
        if (!linkFound) {
            sse.send('Nothing yet...', standardMessageEvent);
            if (count < numberOfRetries) {
                setTimeout(() => { checkFeed(count+1); }, 500);
            }
        }
    });
}

function wasPostedToday(feedParserItem) {
    var currentDate = new Date();
    var postDate = new Date(feedParserItem.date);

    return currentDate.toDateString() === postDate.toDateString();
}

function findLink(feedParserItem) {
    if (feedParserItem.title && feedParserItem.title.indexOf('Sign Up')) {
        var $ = cheerio.load(feedParserItem.description);
        var paragraphs = $('p').toArray();
        var paragraphContainingLink = _.find(paragraphs, paragraph => $(paragraph).text().indexOf('spots for members of V20') !== -1);
        if (paragraphContainingLink) {
            var link = $(paragraphContainingLink).children('a').attr('href');
            return link;
        }
    }
    return null;
}
