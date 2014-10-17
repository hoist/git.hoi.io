'use strict';
var kue = require('kue');
var _ = require('lodash');
var jsonlint = require("jsonlint");
var fsgit = require('fs-git');
var Application = require('hoist-model').Application;
var path = require('path');
var BBPromise = require('bluebird');
var errors = require('hoist-errors');


var GitDeployer = function () {
  _.bindAll(this);
};


GitDeployer.prototype.start = function () {
  if (!this.queue) {
    this.queue = kue.createQueue();
    this.queue.process('GitPush', 5, this.deploy);
  }
};
GitDeployer.prototype.deploy = function (job, done) {
  var self = this;
  return self.checkout(job)
    .then(function () {
      self.updateConfig(job);
    }).then(function () {
      self.restartExecutor(job);
    }).nodeify(done);
};
GitDeployer.prototype.checkout = function () {

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
          return jsonlint.parse(content);
        });
    }).catch(function (err) {
      console.log(err.message);
      if (!errors.isHoistError(err)) {
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

  var applicationSubDomain = parts[parts.length - 1];
  var organisationName = parts[parts.length - 2];
  return BBPromise.resolve({
    applicationSubDomain: applicationSubDomain,
    organisationName: organisationName
  }).nodeify(callback);
};
GitDeployer.prototype.updateConfig = function (job) {
  //extract subDomain from job
  //load the application
  this.getDetailsFromPath(job.path)
    .then(function (details) {
      return Application.findOneAsync({
        subDomain: details.applicationSubDomain
      });
    }).bind(this)
    .then(function (application) {
      //load the hoist.json file
      return this.loadHoistJson(job.path).bind(this)
        .then(function (settingsFromJson) {
          //update dev settings and mark as dirty
          application.settings.dev = settingsFromJson;
          application.markModified('settings.dev');
          //save application
          return application.saveAsync();
        });
    });


};
GitDeployer.prototype.restartExecutor = function () {

};



module.exports = GitDeployer;
