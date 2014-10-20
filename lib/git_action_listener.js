'use strict';
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var hookFile = path.resolve(__dirname, './hook-include.js');
var applicationJson = require('../application.json')[0];

var GitActionListener = function () {

};
GitActionListener.prototype = {
  bindToRepository: function (repos) {
    repos.on('push', _.bind(this.push, this));
  },
  createHookFile: function (template, target, next) {
    fs.readFile(template, {
      encoding: 'utf8'
    }, function (err, content) {
      if (err) {
        return next(err);
      }
      console.log(applicationJson);
      content = content.replace('#{dirname}', path.resolve(applicationJson.cwd, './lib'));
      fs.writeFile(target, content, {
        mode: '0755'
      }, next);
    });
  },
  push: function (push) {
    var self = this;
    var next = function (err) {
      if (err) {
        console.trace(err);
        push.reject(500, 'unable to create hook file');
      } else {
        push.accept();
      }
    };
    var postReceiveHookFile = path.resolve(push.cwd, './hooks/post-receive');
    fs.lstat(postReceiveHookFile, function (err) {
      if (err && err.code === 'ENOENT') {
        self.createHookFile(hookFile, postReceiveHookFile, next);
      } /* istanbul ignore next */
      else if (err) {
        next(err);
      } else {
        next();
      }
    });
  }
};

module.exports = GitActionListener;
