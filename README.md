# PawsSignUp
A simple node server that checks if a new sign up form is available and redirects to it.

## The Problem
My fiance, a vet student, was trying to sign up for a volunteer opportunity at [PAWS](https://phillypaws.org/) with a limited number of opennings. Every week they release a new Google form, but whenever my fiance clicks on on the link the sign up is always already full. It seems to fill up within 1 minute of the post with the link. 

## The Solution
To give my fiance a chance to sign up I created a simple node server that checks the RSS feed of the Wordpress site where the sign up form is posted and redirects to the form when it becomes available. It's deployed to Azure and can be triggered from any browser. Once triggered, the node server will check the RSS feed every half second for 20 minutes, looking for any post from the current day that conatins the appropriate string. Then, it parses that post looking for the sign up link and redirects the client browser to the form once it's found.

## Implementation
- [Express](https://github.com/expressjs/express) - framework for simple server routing.
- [Express SSE](https://github.com/dpskvn/express-sse) - server-sent events that update the client web page with the status of the running script.
- [Feedparser](https://github.com/danmactough/node-feedparser) - RSS feed parsing.
- [Cheerio](https://github.com/cheeriojs/cheerio) - used for navigating through the HTML of the RSS posts and extracting the sign up form link.
- [Pug](https://github.com/pugjs/pug) - simple template engine for displaying the HTML on the client.

## Dev steps
1. Clone the repo.
1. Run `npm install` in the repo folder.
1. Run `node index.js` to start the server.
1. Open up the browser and navigate to `http://localhost:3000`.

## Deployment Notes
### Changing the Port Setting
When deploying to Azure the port that Express is litening to need to be set to `process.env.port` for things to work properly. I wasted a bunch of time because I forgot about this.
```
app.listen(process.env.port || 3000, function () {
    console.log('Server is running...');
});
```
### Azue Issue with SSE
For some reason Server-Sent Events are not properly working in Azure node deployments out of the box. There's an [issue open on github](https://github.com/sbarski/dashing.net/issues/14) that explains the work around:
1. Go to you app service in the Azure Portal. 
1. Find and open the `App Service Editor`.
1. Open `web.config` and add `responseBufferLimit="0"` so that your handlers looks like this:
```
<handlers>
  <!-- Indicates that the server.js file is a node.js site to be handled by the iisnode module -->
  <add name="iisnode" path="index.js" verb="*" modules="iisnode" responseBufferLimit="0" />
</handlers>
```
