'use strict';
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var hoistModel = require('hoist-model');
var User = hoistModel.HoistUser;
var Organisation = hoistModel.Organisation;
var Application = hoistModel.Application;
var BBPromise = require('bluebird');
var hookFile = path.resolve(__dirname, './hook-include.js');
var applicationJson = require('../application.json')[0];
var logger = require('hoist-logger');

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
      content = content.replace('#{dirname}', path.resolve(applicationJson.cwd, './lib'));
      fs.writeFile(target, content, {
        mode: '0755'
      }, next);
    });
  },
  push: function (push) {
    logger.info({
      push: push
    }, "received git push");
    var self = this;
    return this.processSecurity(push, 'push')
      .then(function (gitObject) {
        logger.info({
          gitObject: gitObject
        }, "security processed");
        var next = function (err) {
          if (err) {
            logger.error('error with git push');
            logger.error(err);
            gitObject.reject(500, err);
          } else {
            logger.info('git push accepted');
            gitObject.accept();
          }
        };
        var postReceiveHookFile = path.resolve(gitObject.cwd, './hooks/post-receive');
        fs.lstat(postReceiveHookFile, function (err) {
          if (err && err.code === 'ENOENT') {
            logger.info('writing hook file');
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
    if (!auth) {
      logger.warn("no auth header present");
      return BBPromise.reject(new Error('Bad request'));
    } else {
      logger.info({
        authHeader: auth
      }, "processing auth header");
      plainAuth = new Buffer(auth.split(' ')[1], 'base64').toString();
      logger.info({
        plainHeader: plainAuth
      }, "processing plain header");
      creds = plainAuth.split(':');
      return this.permissableMethod(creds[0], creds[1], method, gitObject);
    }
  },
  permissableMethod: function (username, password, method, gitObject) {
    var repoSplit = gitObject.repo.split('/');

    var gitRepo = repoSplit[1];
    if (gitRepo.length > 4) {
      gitRepo = gitRepo.indexOf('.git') !== gitRepo.length - 4 ? gitRepo.slice(0, -4) : gitRepo;
    }
    var gitFolder = repoSplit[0];
    logger.info({
      gitFolder: gitFolder,
      gitRepo: gitRepo
    }, 'git credentials');
    return this.getUser(username, password)
      .then(function (user) {
        if (!user) {
          throw new Error('Bad request');
        }
        // check if user is in organisation
        return Organisation.findOneAsync({
          gitFolder: gitFolder,
          _id: {
            $in: user.organisations
          }
        });
      }).then(function (org) {
        if (!org) {
          logger.warn('unable to load organisation');
          throw new Error('Bad request');
        }
        logger.info({
          org: org.toObject()
        }, 'loaded organisation');
        //check if organisation has application

        return Application.findOneAsync({
          gitRepo: gitRepo,
          organisation: org._id
        });
      }).then(function (app) {
        if (!app) {
          logger.warn('unable to load application');
          throw new Error('Bad request');
        }
        logger.info({
          app: app.toObject()
        }, 'loaded app');
        return gitObject;
      });
  },
  getUser: function (username, password) {
    return User.findOneAsync({
      emailAddresses: {
        $elemMatch: {
          address: username.toLowerCase()
        }
      }
    }).then(function (user) {
      if (user) {
        logger.info({
          user: user.toObject()
        }, 'loaded user');
      } else {
        logger.warn('no user found');
      }
      if (user && user.verifyPassword(password)) {
        return user;
      } else {
        logger.warn('user doesnt exist or password wrong');
        return false;
      }
    });
  }
};



module.exports = GitActionListener;
