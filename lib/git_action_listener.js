'use strict';
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var hookFile = path.resolve(__dirname, './hook.js');

var GitActionListener = function (repos) {
  repos.on('push',_.bind(this.push,this));
};
GitActionListener.prototype = {
  push: function (push) {
    var next = function (err) {
      if (err) {
        push.reject(500, err);
      } else {
        push.accept();
      }
    };
    var postReceiveHookFile = path.resolve(push.cwd, './hooks/post-receive');
    fs.lstat(postReceiveHookFile, function (err, s) {
      if (err && err.code === 'ENOENT') {
        fs.symlink(hookFile, postReceiveHookFile, next);
      } /* istanbul ignore next */ else if (err) {
        next(err);
      } else if (s.isSymbolicLink()) {
        next();
      } else {
        next('hook file already exists: ' + postReceiveHookFile);
      }
    });
  }
};

module.exports = GitActionListener;
