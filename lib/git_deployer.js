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
var Agenda = require('agenda');
var fs = BBPromise.promisifyAll(require('fs-extra'));
var rimraf = BBPromise.promisify(require('rimraf'));


var GitDeployer = function () {
  _.bindAll(this);
};

GitDeployer.prototype.getAgenda = function () {
  return this.agenda || (this.agenda = BBPromise.promisifyAll(new Agenda({
    db: {
      address: config.get('Hoist.mongo.db')
    }
  })));
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
GitDeployer.prototype.deploy = function (job, log, write, done) {
  var self = this;
  job.write = write;
  job.log = log;
  job.timestamp = moment();

  log('extracting application content');
  return self.checkout(job)
    .then(function npmInstall() {
      return self.npm(job);
    }).then(function deployFiles() {
      return self.deployFiles(job);
    }).then(function updateConfig() {
      return self.updateConfig(job);
    }).spread(function updateSchedules(application) {
      return self.updateSchedules(job, application);
    }).then(function clearOldDirectories() {
      return self.clearOldDirectories(job);
    }).catch(function catchError(err) {
      logger.error(err);
      log('there was an error during deployment:' + err.message);
      throw err;
    }).nodeify(done);
};
GitDeployer.prototype.deployFiles = function (job) {
  var gitRepoPath = job.path;
  var parts = gitRepoPath.split(path.sep);
  var deployedPath = path.join(config.get('Hoist.executor.root'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''), job.timestamp.format('X'));
  var symlinkPath = path.join(config.get('Hoist.executor.root'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''), 'current');
  var srcPath = path.join(config.get('Hoist.git.checkoutTmpDir'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''), job.timestamp.format('X'));
  job.log('deploying files to servers');
  var progress = setInterval(function () {
    job.write('#');
  }, 500);
  return fs.copyAsync(srcPath, deployedPath)
    .then(function () {
      if (fs.existsSync(symlinkPath)) {
        return fs.unlinkAsync(symlinkPath);
      }
    })
    .then(function () {
      return fs.symlinkAsync(deployedPath, symlinkPath);
    }).finally(function () {
      clearInterval(progress);
      job.write('\n');
    });
};
GitDeployer.prototype.clearOldDirectories = function (job) {
  var gitRepoPath = job.path;
  var parts = gitRepoPath.split(path.sep);
  var deployedPath = path.join(config.get('Hoist.executor.root'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''));
  var checkoutPath = path.join(config.get('Hoist.git.checkoutTmpDir'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''));
  return BBPromise.all([
    this.clearDirectories(deployedPath),
    this.clearDirectories(checkoutPath)
  ]);
};
GitDeployer.prototype.clearDirectories = function (pathToDelete) {
  return fs.readdirAsync(pathToDelete)
    .then(function (directories) {
      directories = _.sortBy(_.without(directories, '.npmcache'), function (dirName) {
        return dirName;
      });
      //keep 3 directories
      var directoriesToDelete = _.initial(directories, 3);
      return BBPromise.all(_.map(directoriesToDelete, function deleteDirectory(dir) {
        return rimraf(path.join(pathToDelete, dir));
      }));
    });
};
GitDeployer.prototype.updateSchedules = function updateSchedules(job, application) {
  logger.info({
    application: application
  }, 'updating schedules');
  return BBPromise.try(function deleteExistingSchedules() {
    logger.info('deleting schedules');
    job.log('cancelling existing schedules');
    return this.getAgenda().cancelAsync({
      'data.application': application._id
    });
  }, [], this).bind(this).then(function addNewSchedules() {
    console.log(application.settings);
    if (application.settings.live.schedules) {
      return BBPromise.all(_.map(application.settings.live.schedules, function (schedule, key) {
        var scheduleJob = BBPromise.promisifyAll(this.agenda.create('create:event', {
          application: application._id,
          environment: 'live',
          events: schedule.events
        }));
        scheduleJob.repeatEvery(key);
        job.log('adding schedule for ' + key);
        return scheduleJob.saveAsync();
      }, this));
    }
  });
};


GitDeployer.prototype.npm = /* istanbul ignore next */ function npm(job) {
  var gitRepoPath = job.path;
  var parts = gitRepoPath.split(path.sep);
  var rootPath = path.join(config.get('Hoist.git.checkoutTmpDir'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''));
  var targetPath = path.join(rootPath, job.timestamp.format('X'));
  var npmCachePath = path.join(rootPath, '.npmcache');
  var npmModulesPath = path.join(targetPath, 'node_modules');
  var packageJsonPath = path.join(targetPath, 'package.json');
  var promise = BBPromise.resolve(null);
  var progress;
  //no package.json so don't do an npm install
  if (!fs.existsSync(packageJsonPath)) {
    return BBPromise.resolve(null);
  }
  if (fs.existsSync(npmCachePath)) {
    progress = setInterval(function () {
      job.write('#');
    }, 500);
    job.log('restoring npm cache');
    promise = fs.copyAsync(path.join(rootPath, '.npmcache'), path.join(targetPath, 'node_modules')).finally(function () {
      clearInterval(progress);
    });
  }
  return promise.then(function () {
    return new BBPromise(function (resolve, reject) {
      job.log('npm installing');
      var npmProcess = require('child_process').exec('npm install --production --spin false', {
        cwd: targetPath
      }, function (error) {
        if (error) {
          logger.error(error);
          job.log(error.message);
          reject();
        } else {
          resolve();
        }
      });
      npmProcess.stdout.on('data', function (data) {
        job.log('' + data);
      });
      npmProcess.stderr.on('data', function (data) {
        job.log('' + data);
      });
      npmProcess.stdout.pipe(process.stdout);
      npmProcess.stderr.pipe(process.stderr);
    });
  }).then(function () {
    job.log('updating npm cache');
    progress = setInterval(function () {
      job.write('#');
    }, 500);
    fs.copyAsync(npmModulesPath, npmCachePath).then(function () {
      console.log('npm cache deleted');
    }).catch(function (err) {
      logger.error(err);
      logger.alert(err);
    }).finally(function () {
      clearInterval(progress);
      job.write('\n');
    });
  });
};
GitDeployer.prototype.checkout = function checkout(job) {
  var gitRepoPath = job.path;
  var parts = gitRepoPath.split(path.sep);

  var targetPath = path.join(config.get('Hoist.git.checkoutTmpDir'), parts[parts.length - 2], parts[parts.length - 1].replace('.git', ''), job.timestamp.format('X'));
  job.log('moving application files into position');
  var progress = setInterval(function () {
    job.write('#');
  }, 500);
  return mkdirp(targetPath).then(function () {
    return childProcess.execAsync('git clone ' + gitRepoPath + ' ' + targetPath);
  }).finally(function () {
    clearInterval(progress);
    job.write('\n');
  });
};
GitDeployer.prototype.loadHoistJson = function loadHoistJson(gitRepoPath, log, callback) {
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
            logger.info('parsing hoist.json file');
            log('parsing hoist.json file');
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
GitDeployer.prototype.getDetailsFromPath = function getDetailsFromPath(gitRepoPath, callback) {
  var parts = gitRepoPath.split(path.sep);

  return BBPromise.resolve({
    repoName: parts[parts.length - 1].replace('.git', ''),
    folderName: parts[parts.length - 2]
  }).nodeify(callback);
};
GitDeployer.prototype.updateConfig = function updateConfig(job) {
  //extract subDomain from job
  //load the application

  return this.getDetailsFromPath(job.path)
    .then(function loadOrg(details) {
      job.log('finding application');
      return Organisation.findOneAsync({
        slug: details.folderName
      }).then(function loadApp(org) {
        if (!org) {
          throw new errors.model.organisation.NotFoundError();
        }
        return Application.findOneAsync({
          organisation: org._id,
          gitRepo: details.repoName
        });
      });
    }).bind(this)
    .then(function processSettings(application) {
      if (!application) {
        throw new errors.model.application.NotFoundError();
      }
      job.log('extracting new settings');
      //load the hoist.json file
      return this.loadHoistJson(job.path, job.log).bind(this)
        .then(function saveSettings(settingsFromJson) {
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
