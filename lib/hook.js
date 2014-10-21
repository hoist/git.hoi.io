'use strict';



var chalk = require('chalk');
var kue = require('kue');
var path = require('path');
var configPath = path.resolve(__filename, '../../', 'config');
process.env.NODE_CONFIG_DIR = configPath;
var config = require('config');
var jobs = kue.createQueue({
  redis: {
    port: config.get('Hoist.kue.port'),
    host: config.get('Hoist.kue.host'),
    db: config.get('Hoist.kue.db')
  }
});



console.log('starting deployment');
console.log('connecting to worker');
var jobData = {
  path: process.cwd()
};
var job = jobs.create('GitPush', jobData).priority('high').attempts(1);

var _log = [];

function postLog(err, log) {
  if (log.length > _log.length) {
    var items = log.slice(_log.length - log.length);
    _log = log;
    items.forEach(function (message) {
      console.log(message);
    });
  }
}

var logger = setInterval(function () {
  kue.Job.log(job.id, postLog);
}, 500);

job.on('complete', function () {
  clearInterval(logger);
  kue.Job.log(job.id, function (err, log) {
    postLog(err, log);
    console.log(chalk.green('splines reticulated'));
    jobs.shutdown(function () {
      process.exit(0);
    }, 5000);
  });
});
job.on('failed', function () {
  clearInterval(logger);
  kue.Job.log(job.id, function (err, log) {
    postLog(err, log);
    console.log(chalk.red('an error ocurred during deployment'));
    jobs.shutdown(function () {
      process.exit(1);
    }, 5000);
  });
});
job.save();
