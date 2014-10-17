'use strict';
var http = require('http');
var pushover = require('pushover');
var repos = pushover('/tmp/repos', {
    autoCreate: false
});

var GitActionListener = require('./git_action_listener');
var listener = new GitActionListener();
listener.bindToRepository(repos);
var server = http.createServer(function (req, res) {
    repos.handle(req, res);
});

server.listen(7000, /* istanbul ignore next: not worth testing */ function (err) {

    if (err) {
        throw err;
    }
    console.log('listening for git actions');
});