'use strict';
process.title = 'git-deployer';
var Deployer = require('./lib/git_deployer');
var deployer = new Deployer();
process.on('message', function (msg) {
  console.log('got message', msg, msg === 'shutdown');
  if (msg === 'shutdown') {
    console.log('closing connection');
    setTimeout(function () {
      console.log('shutting down deploy agent');
      deployer.stop(function () {
        process.exit(0);
      });
    }, 500);
  }
});
deployer.start(function (err) {
  if (err) {
    throw err;
  }
  console.log('started');
});
