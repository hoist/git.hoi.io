'use strict';
var kue = require('kue');
var _ = require('lodash');
var jsonlint = require("jsonlint");
var fsgit = require('fs-git');
var Application = require('hoist-model').Application;
var Organisation = require('hoist-model').Organisation;
var path = require('path');
var BBPromise = require('bluebird');
var errors = require('hoist-errors');
var childProcess = BBPromise.promisifyAll(require('child_process'));
var moment = require('moment');
var config = require('config');
var mkdirp = BBPromise.promisify(require('mkdirp'));
var mongoose = BBPromise.promisifyAll(require('hoist-model')._mongoose);

var GitDeployer = function () {
  _.bindAll(this);
};


GitDeployer.prototype.start = function (done) {
  /* istanbul ignore else */
  if (!this.queue) {
    return BBPromise.try(function () {
        var connected = false;
        /* istanbul ignore if */
        if (mongoose.connection && mongoose.connection.readyState > 0) {
          connected = true;
        }
        return connected;
      }).bind(this)
      .then(function (connected) {
        /* istanbul ignore else */
        if (!connected) {
          return mongoose.connectAsync(config.get('Hoist.mongo.db'));
        } else {
          return null;
        }
      }).then(function () {
        this.queue = kue.createQueue({
          redis: {
            port: config.get('Hoist.kue.port'),
            host: config.get('Hoist.kue.host'),
            db: config.get('Hoist.kue.db')
          }
        });
        this.queue.process('GitPush', 5, this.deploy);
      }).nodeify(done);
  } else {
    return BBPromise.resolve(null).nodeify(done);
  }
};
GitDeployer.prototype.stop = function (done) {
  /* istanbul ignore else */
  if (this.queue) {
    return BBPromise.try(function () {
      var connected = false;
      /* istanbul ignore else */
      if (mongoose.connection && mongoose.connection.readyState > 0 && mongoose.connection.readyState < 3) {
        connected = true;
      }
      return connected;
    }).bind(this).then(function (connected) {
      /* istanbul ignore else */
      if (connected) {
        return mongoose.disconnectAsync();
      }
    }).then(function () {
      var self = this;
      return new BBPromise(function (resolve, reject) {
        self.queue.shutdown(function (err) {
          /* istanbul ignore if */
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }, 5000);
      });
    }).nodeify(done);
  } else {
    return BBPromise.resolve(null).nodeify(done);
  }
};
GitDeployer.prototype.deploy = function (job, done) {
  var self = this;
  job.timestamp = moment();
  job.log('parsing hoist.json file');
  return self.updateConfig(job)
    .then(function () {
      job.log('extracting application content');
      self.checkout(job);
    }).nodeify(done);
};
GitDeployer.prototype.checkout = function (job) {
  var gitRepoPath = job.data.path;
  var parts = gitRepoPath.split(path.sep);

  var targetPath = path.join(config.get('Hoist.executor.root'), parts[parts.length - 2], parts[parts.length - 1].replace('.git',''), job.timestamp.format('X'));
  job.log('moving applicaiton files into position');
  return mkdirp(targetPath).then(function () {
    return childProcess.execAsync('git clone ' + gitRepoPath + ' ' + targetPath);
  });
};
GitDeployer.prototype.loadHoistJson = function (gitRepoPath, callback) {
  return BBPromise.resolve(fsgit.open(gitRepoPath))
    .then(function (fs) {
      return fs.exists('hoist.json')
        .then(function (exists) {
          if (!exists) {
            throw new errors.files.hoistJson.NotFoundError();
          }
          return fs.readFile('hoist.json');

        }).then(function (content) {
          return BBPromise.try(function () {
            return jsonlint.parse(content);
          }).catch(function (err) {

            throw new errors.files.hoistJson.InvalidJsonError(err.message);
          });
        });
    }).catch(function (err) {
      console.log(err.message);

      if (!errors.isHoistError(err)) {
        /* istanbul ignore else */
        if (err.message.indexOf('Not a git repository') > -1) {
          err = new errors.git.NotFoundError();
        } else if (err.message.indexOf('Command failed:') > -1) {
          err = new errors.git.InvalidError();
        } else {
          console.log(err.message);
          err = new errors.HoistError();
        }
      }
      throw err;
    }).nodeify(callback);
};
GitDeployer.prototype.getDetailsFromPath = function (gitRepoPath, callback) {
  var parts = gitRepoPath.split(path.sep);

  return BBPromise.resolve({
    repoName: parts[parts.length - 1].replace('.git', ''),
    folderName: parts[parts.length - 2]
  }).nodeify(callback);
};
GitDeployer.prototype.updateConfig = function (job) {
  //extract subDomain from job
  //load the application

  return this.getDetailsFromPath(job.data.path)
    .then(function (details) {
      job.log('finding application');
      return Organisation.findOneAsync({
        gitFolder: details.folderName
      }).then(function (org) {
        if (!org) {
          throw new errors.model.organisation.NotFoundError();
        }
        return Application.findOneAsync({
          organisation: org._id,
          gitRepo: details.repoName
        });
      });
    }).bind(this)
    .then(function (application) {
      if (!application) {
        throw new errors.model.application.NotFoundError();
      }
      job.log('extracting new settings');
      //load the hoist.json file
      return this.loadHoistJson(job.data.path).bind(this)
        .then(function (settingsFromJson) {

          job.log('setting new settings');
          //update dev settings and mark as dirty
          application.settings.dev = settingsFromJson;
          application.markModified('settings.dev');
          //set deploy date
          job.log('updating deployment log');
          application.lastDeploy.dev = job.timestamp.toDate();
          //save application
          return application.saveAsync();
        });
    });
};



module.exports = GitDeployer;
