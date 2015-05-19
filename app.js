'use strict';
require("babel/register");
process.title = 'git-listener';
var server = require('./lib/server');


process.on('message', function (msg) {
  console.log('got message', msg, msg === 'shutdown');
  if (msg === 'shutdown') {
    console.log('closing connection');
    setTimeout(function () {
      console.log('shutting down git server');
      server.stop(function () {
        process.exit(0);
      });
    }, 500);
  }
});

server.start(function (err) {
  if (err) {
    throw err;
  }
  console.log('started');
});
