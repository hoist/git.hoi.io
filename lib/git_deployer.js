'use strict';
var kue = require('kue');
var _ = require('lodash');
var jsonlint = require("jsonlint");
var fsgit = require('fs-git');
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
GitDeployer.prototype.loadHoistJson = function (gitRepoPath) {
  return fsgit.open(gitRepoPath)
    .then(function (fs) {
      return fs.exists('hoist.json')
        .then(function (exists) {
          if (!exists) {
            throw new Error('hoist.json file not found');
          }
          return fs.readFile('hoist.json');

        }).then(function (content) {
          return jsonlint.parse(content);
        });
    });
};
GitDeployer.prototype.updateConfig = function (job) {

  //load the hoist.json file
  return this.loadHoistJson(job.path);
  //load the application
  //update dev settings and mark as dirty
  //save application
};
GitDeployer.prototype.restartExecutor = function () {

};



module.exports = GitDeployer;
