'use strict';
import Promise from 'bluebird';
import streamToPromise from 'stream-to-promise';
import Targz from 'tar.gz';
import config from 'config';
import path from 'path';
import moment from 'moment';
import logger from '@hoist/logger';
import uuid from 'uuid';
import {
  _mongoose,
  Organisation,
  Application,
  ExecutionLogEvent,
  Event
}
from '@hoist/model';
import {
  NotificationLogger,
  Publisher,
  Notification
}
from '@hoist/broker';
import errors from '@hoist/errors';
import jsonlint from 'jsonlint';
import Git from 'nodegit';
import Agenda from 'agenda';
import _ from 'lodash';
import rimraf from 'rimraf';

let rimrafAsync = Promise.promisify(rimraf);

import fs from 'fs-extra';
Promise.promisifyAll(fs);
let temp = Promise.promisifyAll(require('temp'));
let targz = Promise.promisifyAll(new Targz());
let gitArchive = Promise.promisify(require('git-archive'));
Promise.promisifyAll(_mongoose);


class Deployer {
  constructor(buffer) {
    temp.track();
    let params = buffer.toString().replace('\n', '').split(' ');
    this.timestamp = moment();
    this.originalSha1 = params[0];
    this.commitSha1 = params[1];
    this.branch = params[2];
    this.publisher = new Publisher();
    this.applicationEventLogger = this.publisher;
    this.notificationLogger = new NotificationLogger();
    let subpath = process.cwd().replace(config.get('Hoist.filePaths.repositories'), '');
    subpath = subpath.replace('.git', '');

    let subPathParts = subpath.split('/');

    this.organisationSlug = subPathParts[1];
    this.applicationSlug = subPathParts[2];
    this.deployRoot = path.join(config.get("Hoist.filePaths.deploys"), subpath);
    this.deployFolder = this.timestamp.format('X');
  }
  getNpmCachePath() {
    return this.npmCachePath || (this.npmCachePath = path.join(this.deployRoot, '.npmcache'));
  }
  getDeployPath() {
    return this.deployPath || (this.deployPath = path.join(this.deployRoot, this.deployFolder));
  }
  getSymlinkPathPath() {
    return this.symlinkPath || (this.symlinkPath = path.join(this.deployRoot, 'current'));
  }
  primeRepository() {
    return Git.Repository.open(process.cwd())
      .then((repository) => {
        this.repository = repository;
      });
  }
  getAgenda() {
    if (!this.agenda) {


      this.agenda = Promise.resolve()
        .then(() => {
          return Promise.promisifyAll(new Agenda({
            db: {
              address: config.get('Hoist.mongo.core.connectionString')
            }
          }));
        }).then((agenda) => {
          return Promise.delay(500).then(() => {
            return agenda;
          });
        });
    }
    return this.agenda;
  }
  deploy() {
    let deleteDeployDir = true;
    let timings = {
      start: process.hrtime()
    };
    if (this.commitSha1 === "0000000000000000000000000000000000000000") {
      //deleting branch
      return Promise.resolve();
    }
    return this.printBanner()
      .then(() => {
        timings.printBanner = process.hrtime(timings.start);
        return this.openDBConnection();
      })
      .then(() => {
        timings.openConnection = process.hrtime(timings.printBanner);
        return this.primeRepository();
      })
      .then(() => {
        timings.primeRepository = process.hrtime(timings.openConnection);
        return this.loadApplication();
      })
      .then(() => {
        timings.loadApplication = process.hrtime(timings.primeRepository);
        return this.applicationEventLogger.log(new ExecutionLogEvent({
          message: `Deploy starting. Hash: ${this.commitSha1}`,
          type: 'DEPLOY',
          application: this.application._id,
          environment: 'live'
        }));
      }).then(() => {
        timings.startDeployLog = process.hrtime(timings.loadApplication);
        return this.createArchive();
      }).then(() => {
        timings.createArchive = process.hrtime(timings.startDeployLog);
        return this.deployArchive();
      }).then(() => {
        timings.deployArchive = process.hrtime(timings.createArchive);
        return this.npmInstall();
      }).then(() => {
        timings.npmInstall = process.hrtime(timings.deployArchive);
        console.log('updating config');
        return this.updateConfig();
      }).then(() => {
        timings.updateConfig = process.hrtime(timings.npmInstall);
        return this.updateSchedules();
      }).then(() => {
        timings.updateSchedules = process.hrtime(timings.updateConfig);
        return this.application.saveAsync();
      }).then(() => {
        timings.saveApplication = process.hrtime(timings.updateSchedules);
        return this.linkReleaseDirectory();
      }).then(() => {
        timings.linkReleaseDirectory = process.hrtime(timings.saveApplication);
        deleteDeployDir = false;
        process.stdout.write('\x1b[32mDeploy Completed Successfully\x1b[37m\n');
      }).then(() => {
        timings.done = process.hrtime(timings.linkReleaseDirectory);
        return this.clearOldDirectories().catch(() => {});

      }).then(() => {
        timings.clearOldDirectories = process.hrtime(timings.done);
        return Promise.all([
          this.notificationLogger.log(new Notification({
            applicationId: this.application._id,
            notificationType: 'Update'
          })),
          this.publisher.publish(new Event({
            eventId: uuid.v4().split('-').join(''),
            applicationId: this.application._id,
            eventName: 'POST:DEPLOY',
            environment: 'live',
            correlationId: uuid.v4(),
            payload: {}
          }))
        ]);
      }).then(() => {
        timings.endDeployEvent = process.hrtime(timings.clearOldDirectories);
        if (this.application) {
          return this.applicationEventLogger.log(new ExecutionLogEvent({
            message: `Deploy complete. Hash: ${this.commitSha1}`,
            type: 'DEPLOY',
            application: this.application._id,
            environment: 'live'
          }));
        }
      }).catch((err) => {
        console.error(err);
        logger.alert(err);
        return Promise.resolve()
          .then(() => {
            if (this.application) {
              return this.applicationEventLogger.log(new ExecutionLogEvent({
                message: `Deploy failed. Hash: ${this.commitSha1}`,
                type: 'DEPLOY',
                application: this.application._id,
                environment: 'live'
              }));
            }
          }).then(() => {
            if (deleteDeployDir) {
              return fs.removeAsync(this.getDeployPath())
                .catch((err2) => {
                  console.error(err2);
                });
            }
          }).then(() => {
            throw err;
          });
      }).finally(() => {
        timings.total = process.hrtime(timings.start);
        logger.warn({
          timings
        }, 'final timings');
        return this.closeDBConnection();
      });
  }
  openDBConnection() {
    return _mongoose.connectAsync(config.get('Hoist.mongo.core.connectionString'));
  }
  closeDBConnection() {
    return _mongoose.disconnectAsync();
  }
  loadOrganisation() {
    return Promise.resolve(this.organisation || Organisation.findOneAsync({
      slug: this.organisationSlug
    })).then((organisation) => {
      this.organisation = organisation;
      return this.organisation;
    });
  }
  loadApplication() {
    return Promise.resolve(this.application || this.loadOrganisation()
      .then(() => {
        return Application.findOneAsync({
          organisation: this.organisation._id,
          slug: this.applicationSlug
        });
      }).then((application) => {
        this.application = application;
      }));
  }
  updateConfig() {
    return this.loadHoistJSON()
      .then((hoistJson) => {
        console.log('saving new settings');
        this.application.settings.live = hoistJson;
        this.application.markModified('settings.live');
        this.application.lastDeploy.live = this.timestamp.toDate();
        return this.repository.getCommit(this.commitSha1)
          .then((commit) => {
            this.application.lastCommit.live = {
              message: commit.message(),
              sha1: this.commitSha1,
              user: commit.author().name() + ' ' + commit.author().email()
            };

          });


      });
  }
  loadHoistJSON() {
    return fs.readFileAsync(path.join(this.getDeployPath(), 'hoist.json'), {
        encoding: 'utf8'
      })
      .then((hoistJson) => {
        return Promise.try(() => {
          console.log('parsing hoist.json file');
          return jsonlint.parse(hoistJson);
        }).catch(function (err) {

          throw new errors.files.hoistJson.InvalidJsonError(err.message);
        });
      });
  }
  restoreNpmCache() {
    return Promise.try(() => {
      if (fs.existsSync(this.getNpmCachePath())) {
        var progress = setInterval(function () {
          process.stdout.write('#');
        }, 10);
        console.log('restoring npm cache');
        return Promise.resolve(fs.copySync(this.getNpmCachePath(), path.join(this.getDeployPath(), 'node_modules')))
          .finally(function () {
            clearInterval(progress);
            console.log('#\n');
          });
      }
    });
  }
  saveNpmCache() {
    return Promise.try(() => {
        console.log('saving npm cache');
        if (fs.existsSync(this.getNpmCachePath())) {
          fs.removeSync(this.getNpmCachePath());
        }
      })
      .then(() => {
        this.progress = setInterval(function () {
          process.stdout.write('#');
        }, 10);
      })
      .then(() => {
        return Promise.resolve()
          .then(() => {
            if (fs.existsSync(path.join(this.getDeployPath(), 'node_modules'))) {
              fs.copySync(path.join(this.getDeployPath(), 'node_modules'), this.getNpmCachePath(), {
                clobber: true
              });
            }
          });
      }).finally(() => {
        clearInterval(this.progress);
        process.stdout.write('#\n');
      });

  }
  npmInstall() {
    var packageJsonPath = path.join(this.getDeployPath(), 'package.json');
    //no package.json so don't do an npm install
    if (!fs.existsSync(packageJsonPath)) {
      return Promise.resolve(null);
    }
    return this.restoreNpmCache()
      .then(() => {
        console.log('\x1b[32m--------> starting npm install\x1b[37m\n');
        return new Promise((resolve, reject) => {
          var npmProcess = require('child_process')
            .spawn('npm', ['install', '--production', '--loglevel info', '--spin false'], {
              cwd: this.getDeployPath(),
              stdio: [process.stdin, process.stdout, 'pipe']
            });
          npmProcess.stderr.on('data', function (data) {
            process.stdout.write('\x1b[31m');
            process.stdout.write(data);
            process.stdout.write('\x1b[37m');
          });
          npmProcess.on('exit', function (code) {
            if (code === 0) {
              process.stdout.write('\x1b[32m<-------- npm install done\x1b[37m\n');
              resolve();
            } else {
              reject(new Error('npm install failed'));
            }
          });
        });
      }).then(() => {
        return this.saveNpmCache();
      });


  }
  printBanner() {
    return streamToPromise(fs.createReadStream(path.resolve(__dirname, './banner.txt')))
      .then((banner) => {
        process.stdout.write('\x1b[32m');
        process.stdout.write(banner);
        process.stdout.write('\x1b[37m');
      })
      .then(() => {
        console.log('starting deployment');
        console.log('\x1b[42;30mref:\x1b[40;37m', this.branch);
        console.log('\x1b[42;30mcommit:\x1b[40;37m', this.commitSha1);
        console.log('\x1b[42;30moriginal:\x1b[40;37m', this.originalSha1);
      });
  }
  createArchive() {
    return temp.openAsync({
      suffix: '.tar.gz'
    }).then((archive) => {
      this.archive = archive;

      return gitArchive({
        commit: this.commitSha1,
        outputPath: archive.path,
        repoPath: process.cwd()
      });
    });
  }
  deployArchive() {
    return targz.extractAsync(this.archive.path, this.getDeployPath());
  }
  updateSchedules() {
    console.log('deleting existing schedules');
    return this.getAgenda().then((agenda) => {
      return agenda.cancelAsync({
        'data.application': this.application._id
      });
    }).then(() => {
      if (this.application.settings.live.schedules) {
        return this.getAgenda().then((agenda) => {
          return Promise.all(_.map(this.application.settings.live.schedules, (schedule, key) => {
            var scheduleJob = Promise.promisifyAll(agenda.create('create:event2', {
              application: this.application._id,
              environment: 'live',
              events: schedule.events
            }));
            scheduleJob.repeatEvery(key);
            scheduleJob.computeNextRunAt();
            console.log('adding schedule for ' + key);
            return scheduleJob.saveAsync();
          }, this));
        });
      }
    });
  }
  clearOldDirectories() {
    console.log('cleaning up');
    return fs.readdirAsync(this.deployRoot)
      .then((directories) => {
        directories = _.sortBy(_.without(directories, '.npmcache'), function (dirName) {
          return dirName;
        });

        //keep 3 directories
        var directoriesToDelete = _.dropRight(directories, 3);

        return Promise.all(_.map(directoriesToDelete, (dir) => {
          return Promise.resolve()
            .then(() => {
              fs.removeSync(path.join(this.deployRoot, dir));
            });
        }));
      });
  }
  linkReleaseDirectory() {
    console.log('marking release as current');
    return Promise.resolve()
      .then(() => {
        if (fs.existsSync(this.getSymlinkPathPath())) {
          var stat = fs.lstatSync(this.getSymlinkPathPath());
          if ((!stat.isSymbolicLink()) && stat.isDirectory()) {
            return rimrafAsync(this.getSymlinkPathPath());
          } else {
            fs.unlinkSync(this.getSymlinkPathPath());
          }
        }
      })
      .then(() => {
        fs.symlinkSync(this.getDeployPath(), this.getSymlinkPathPath());
      });
  }

}

module.exports = Deployer;
