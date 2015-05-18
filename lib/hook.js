'use strict';
/* jshint multistr:true */

var path = require('path');
var BBPromise = require('bluebird');
var configPath = path.resolve(__filename, '../../', 'config');
process.env.NODE_CONFIG_DIR = configPath;
var config = require('config');
var dnode = require('dnode');
var logger = require('hoist-logger');
var _ = require('lodash');
logger.streams = _.reject(logger.streams, function (stream) {
  return stream.name === 'console';
});

BBPromise.try(function () {
  process.stdout.write('\x1b[1Ghoist.json found \n\x1b[1G\n\x1b[1GDeploying Hoist Application\n');
  process.stdout.write("\x1b[1G\n\
\x1b[1G __    __   ______   ______   ______   ________\n\
\x1b[1G|  \\  |  \\ /      \\ |      \\ /      \\ |        \\\n\
\x1b[1G| $$  | $$|  $$$$$$\\ \\$$$$$$|  $$$$$$\\\\$$$$$$$$\n\
\x1b[1G| $$__| $$| $$  | $$  | $$  | $$___\\$$  | $$\n\
\x1b[1G| $$    $$| $$  | $$  | $$   \\$$    \\   | $$\n\
\x1b[1G| $$$$$$$$| $$  | $$  | $$   _\\$$$$$$\\  | $$\n\
\x1b[1G| $$  | $$| $$__/ $$ _| $$_ |  \\__| $$  | $$\n\
\x1b[1G| $$  | $$ \\$$    $$|   $$ \\ \\$$    $$  | $$\n\
\x1b[1G \\$$   \\$$  \\$$$$$$  \\$$$$$$  \\$$$$$$    \\$$\n");
  process.stdout.write("\x1b[1G==============================================\n");
  process.stdout.write('\x1b[1G\n');
}).then(function () {
  process.stdout.write('\x1b[1Gstarting deployment\n');
  process.stdout.write('\x1b[1Gconnecting to worker\n');
  var jobData = {
    path: process.cwd()
  };
  var client = dnode.connect(config.get('Hoist.dnode.port'));

  client.on('remote', function (remote) {
    remote.deploy(jobData, function (message) {
      process.stdout.write('\x1b[1G'+message+'\n');
    }, function (message) {
      process.stdout.write('\x1b[1G'+message);
    }, function (err) {
      client.end();
      if (!err) {
        process.stdout.write('\x1b[1Gsplines reticulated');
        process.exit(0);
      } else {
        logger.error(err.message);
        console.stdout.write('\x1b[1Gerror during deploy');
        process.exit(1);
      }
    });
  });

  client.on('error', function () {
    process.stderr.write('\x1b[1Gerror during deploy');
    client.end();
  });
});
