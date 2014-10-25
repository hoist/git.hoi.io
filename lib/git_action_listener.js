'use strict';
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var hoistModel = require('hoist-model');
var User = hoistModel.User;
var Organisation = hoistModel.Organisation;
var Application = hoistModel.Application;
var BBPromise = require('bluebird');
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
    return this.processSecurity(push, 'push').then(function (gitObject) {
      var next = function (err) {
        if (err) {
          console.trace(err);
          gitObject.reject(500, err);
        } else {
          gitObject.accept();
        }
      };
      var postReceiveHookFile = path.resolve(gitObject.cwd, './hooks/post-receive');
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
    }).catch(function (err) {
      return err.message === 'Bad request';
    }, function () {
      push.reject(401, 'Bad request');
    }).catch(function (err) {
      push.reject(500, err);
    });
  },
  processSecurity: function (gitObject, method) {
    var auth, creds, plainAuth, req, res;
    req = gitObject.request;
    res = gitObject.response;
    auth = req.headers.authorization;
    if (auth === void 0) {
      return BBPromise.reject(new Error('Bad request'));
    } else {
      plainAuth = new Buffer(auth.split(' ')[1], 'base64').toString();
      creds = plainAuth.split(':');
      return this.permissableMethod(creds[0], creds[1], method, gitObject);
    }
  },
  permissableMethod: function (username, password, method, gitObject) {
    var repoSplit = gitObject.repo.split('/');
    var application = repoSplit[1];
    application = application.indexOf('.git') === application.length - 4 ? application.slice(0, -4) : application;
    var organisation = repoSplit[0];
    return this.getUser(username, password).then(function (user) {
      if (!user) {
        throw new Error('Bad request');
      }
      // check if user is in organisation
      return Organisation.findOneAsync({
        name: organisation,
        _id: {
          $in: user.organisations
        }
      });
    }).then(function (org) {
      if (!org) {
        throw new Error('Bad request');
      }
      //check if organisation has application
      return Application.findOneAsync({
        name: application,
        _id: {
          $in: org.applications
        }
      });
    }).then(function (app) {
      if (!app) {
        throw new Error('Bad request');
      }
      return gitObject;
    });
  },
  getUser: function (username, password) {
    return User.findOneAsync({
      emailAddresses: {
        $elemMatch: {
          address: username
        }
      }
    }).then(function (user) {
      if (user && user.verifyPassword(password)) {
        return user;
      } else {
        return false;
      }
    });
  }
};



module.exports = GitActionListener;