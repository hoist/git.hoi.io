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
var _ = require('lodash');
var Application = require('hoist-model').Application;
logger.streams = _.reject(logger.streams, function (stream) {
  return stream.name === 'console';
});


function logEvent(message, applicationId) {
  var logEventObject = new Model.ExecutionLogEvent({
    application: applicationId,
    environment: 'live',
    type: 'LOG',
    message: message
  });
  logEventObject.saveAsync();
};

function findApplication(gitRepoPath, callback) {

  var parts = gitRepoPath.split(path.sep);

  return BBPromise.resolve({
    repoName: parts[parts.length - 1].replace('.git', ''),
    folderName: parts[parts.length - 2]
  })
  .then(function(details) {
    return Application.findOneAsync({
      slug: details.repoName
    });
  })
  .nodeify(callback);

};

BBPromise.try(function () {
  findApplication(process.cwd()).then(function(application) {
    logEvent("Deploy starting", application._id);
  });
  console.log(chalk.magenta("hoist.json found \n\nDeploying Hoist Application"));
  console.log(chalk.white("\n\
 __    __   ______   ______   ______   ________\n\
|  \\  |  \\ /      \\ |      \\ /      \\ |        \\\n\
| $$  | $$|  $$$$$$\\ \\$$$$$$|  $$$$$$\\\\$$$$$$$$\n\
| $$__| $$| $$  | $$  | $$  | $$___\\$$  | $$\n\
| $$    $$| $$  | $$  | $$   \\$$    \\   | $$\n\
| $$$$$$$$| $$  | $$  | $$   _\\$$$$$$\\  | $$\n\
| $$  | $$| $$__/ $$ _| $$_ |  \\__| $$  | $$\n\
| $$  | $$ \\$$    $$|   $$ \\ \\$$    $$  | $$\n\
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
    //Find the application that this deploy is associated with
    remote.deploy(jobData, function (message) {
      console.log(message);
    }, function (message) {
      process.stdout.write(message);
    }, function (err) {
      client.end();
      if (!err) {
        console.log(chalk.green('splines reticulated'));
        findApplication(jobData.path).then(function(application) {
          logEvent("Deploy complete", application._id);
        });
        process.exit(0);
      } else {
        logger.error(err.message);
        console.error('error during deploy');
        findApplication(jobData.path).then(function(application) {
          logEvent("Error during deploy: " + err.message, application._id);
        });
        process.exit(1);
      }
    });
  });

  client.on('error', function () {
    console.error('error during deploy');
    client.end();
  });
});
