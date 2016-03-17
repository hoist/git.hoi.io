'use strict';
process.env.MUTE_LOGS = true;
require("babel-register");
var logger = require('@hoist/logger');
process.title = 'git-listener';
var server = require('./lib/server').default;
var spawn = require('child_process').spawn;

var loggerHub = spawn('bunyansub', ['-o', 'long', '--color'], {
  stdio: 'inherit'
});

function gracefullShutdown(SIG) {
  loggerHub.kill(SIG);
  server.stop(function () {
    logger.info('exiting process');
    process.exit(0);
  });
}

server.start(function (err) {
  if (err) {
    throw err;
  }
  process.once('SIGUSR2', function () {
    return gracefullShutdown('SIGUSR2');
  });
  process.once('SIGTERM', function () {
    return gracefullShutdown('SIGTERM');
  });
  process.once('SIGINT', function () {
    return gracefullShutdown('SIGINT');
  });
  console.log('started');
});
