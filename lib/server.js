'use strict';
var http = require('http');
var pushover = require('pushover');
var repos = pushover('/tmp/repos');

require('./git_action_listener')(repos);

var server = http.createServer(function (req, res) {
  repos.handle(req, res);
});

server.listen(7000, function (err) {
  if (err) {
    throw err;
  }
  console.log('listening for git actions');
});
