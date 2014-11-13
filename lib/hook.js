'use strict';
/* jshint multistr:true */


var chalk = require('chalk');
var path = require('path');
var BBPromise = require('bluebird');
var configPath = path.resolve(__filename, '../../', 'config');
process.env.NODE_CONFIG_DIR = configPath;
var config = require('config');
var dnode = require('dnode');
var logger = require('hoist-logger');


BBPromise.try(function () {
  console.log(chalk.magenta("hoist.json found \n\nDeploying Hoist Application"));
  console.log(chalk.white("\n\
 __    __   ______   ______   ______  ________\n\
|  \\  |  \\ /      \\ |    \\   /      \\|        \\\n\
| $$  | $$|  $$$$$$\\ \\$$$$$$|  $$$$$$\\\\$$$$$$$$\n\
| $$__| $$| $$  | $$  | $$   |$$___ \\$$ | $$\n\
| $$    $$| $$  | $$  | $$   \\$$    \\   | $$\n\
| $$$$$$$$| $$  | $$  | $$   _\\$$$$$$\\  | $$\n\
| $$  | $$| $$__/ $$ _| $$___| \\__| $$  | $$\n\
| $$  | $$ \\$$    $$|   $$ \\|\\$$    $$  | $$\n\
 \\$$   \\$$  \\$$$$$$  \\$$$$$$  \\$$$$$$    \\$$"));
  console.log("==============================================");
  console.log('');
}).then(function () {
  console.log('starting deployment');
  console.log('connecting to worker');
  var jobData = {
    path: process.cwd()
  };
  var client = dnode.connect(config.get('Hoist.dnode.port'));

  client.on('remote', function (remote) {
    remote.deploy(jobData, function (message) {
      console.log(message);
    }, function (err) {
      client.end();
      if (!err) {
        console.log(chalk.green('splines reticulated'));
        process.exit(0);
      }
      else{
        logger.error(err);
        console.error('error during deploy');
        process.exit(1);
      }
    });
  });

  client.on('error', function () {
    console.error('error during deploy');
    client.end();
  });
});
