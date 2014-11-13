'use strict';
var dnode = require('dnode');
var _ = require('lodash');
var logger = require('hoist-logger');
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
        this.dnodeServer = dnode({
          deploy: this.deploy
        });
        this.dnodeServer.listen(config.get('Hoist.dnode.port'));
      }).nodeify(done);
  } else {
    return BBPromise.resolve(null).nodeify(done);
  }
};
GitDeployer.prototype.stop = function (done) {
  /* istanbul ignore else */
  if (this.dnodeServer) {
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
        console.log('disconnecting');
        return mongoose.disconnectAsync();
      }
    }).then(function () {
      return new BBPromise.try(function () {
        this.dnodeServer.end();
        this.dnodeServer = null;
      }, [], this);
    }).nodeify(done);
  } else {
    return BBPromise.resolve(null).nodeify(done);
  }
};
GitDeployer.prototype.deploy = function (job, log, done) {
  var self = this;
  job.log = log;
  job.timestamp = moment();
  logger.info('parsing hoist.json file');
  log('parsing hoist.json file');
  return self.updateConfig(job)
    .then(function () {
      log('extracting application content');
      return self.checkout(job);
    })
    .then(function () {
      return self.npm(job);
    }).catch(function (err) {
      logger.error(err);
      throw err;
    }).nodeify(done);
};
GitDeployer.prototype.npm = function (job) {
  var gitRepoPath = job.path;
  var parts = gitRepoPath.split(path.sep);
  var targetPath = path.join(config.get('Hoist.executor.root'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''), job.timestamp.format('X'));
  job.log('npm installing');
  return new BBPromise(function (resolve, reject) {
    require('child_process').exec('npm install --silent --production --spin false', {
      cwd: targetPath
    }, function (error, stdout, stderr) {
      if (stdout) {
        logger.info(stdout + '');
        job.log(stdout + '');
      }
      if (stderr) {
        logger.warn(stderr + '');
      }
      if (error) {
        logger.error(error);
        reject();
      } else {
        resolve();
      }


    });
  });
};
GitDeployer.prototype.checkout = function (job) {
  var gitRepoPath = job.path;
  var parts = gitRepoPath.split(path.sep);

  var targetPath = path.join(config.get('Hoist.executor.root'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''), job.timestamp.format('X'));
  job.log('moving application files into position');
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
      logger.error(err.message);

      if (!errors.isHoistError(err)) {
        /* istanbul ignore else */
        if (err.message.indexOf('Not a git repository') > -1) {
          err = new errors.git.NotFoundError();
        } else if (err.message.indexOf('Command failed:') > -1) {
          err = new errors.git.InvalidError();
        } else {
          logger.error(err.message);
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

  return this.getDetailsFromPath(job.path)
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
      return this.loadHoistJson(job.path).bind(this)
        .then(function (settingsFromJson) {

          job.log('setting new settings');
          //update live settings and mark as dirty
          application.settings.live = settingsFromJson;
          application.markModified('settings.live');
          //set deploy date
          job.log('updating deployment log');
          application.lastDeploy.live = job.timestamp.toDate();
          //save application
          return application.saveAsync();
        });
    });
};



module.exports = GitDeployer;
