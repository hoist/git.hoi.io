'use strict';
import path from 'path';
import fs from 'fs';
import {
  HoistUser, Organisation, Application
}
from '@hoist/model';
import logger from '@hoist/logger';
import errors from '@hoist/errors';
import Bluebird from 'bluebird';

Bluebird.promisifyAll(fs);

var hookFile = path.resolve(__dirname, './hook-include.sh');

class GitActionListener {
  constructor() {
    this._logger = logger.child({
      cls: this.constructor.name
    });
  }
  bindToRepository(repos) {
    this._logger.info('binding to repository');
    repos.on('push', (push) => {
      return this.push(push);
    });

  }

  createHookFile(template, target) {
    this._logger.info('creating hook file');
    return fs.readFileAsync(template, {
      encoding: 'utf8'
    }).then((content) => {
      content = content.replace('#{dirname}', path.resolve(__dirname));
      return fs.writeFileAsync(target, content, {
        mode: '0755'
      });
    });
  }

  push(push) {
    this._logger.info("received git push");

    return this.processSecurity(push, 'push')
      .then((gitObject) => {
        this._logger.info("security processed");
        let postReceiveHookFile = path.resolve(gitObject.cwd, './hooks/post-receive');
        fs.unlink(postReceiveHookFile, function () {
          //throw away error as we don't care
        });
        let preRecieveHookFile = path.resolve(gitObject.cwd, './hooks/pre-receive');
        return this.createHookFile(hookFile, preRecieveHookFile);
      }).then(() => {
        push.accept();
      }).catch((err) => {
        console.log(err.code);
        this._logger.error(err);
        logger.alert(err);
        push.reject(err.code || 500, err.message);
      });
  }

  processSecurity(gitObject, method) {
    var auth, creds, plainAuth, req;
    req = gitObject.request;
    auth = req.headers.authorization;
    if (!auth) {
      this._logger.warn("no auth header present");
      return Promise.reject(new Error('Bad request'));
    } else {
      this._logger.info({
        authHeader: auth
      }, "processing auth header");
      plainAuth = new Buffer(auth.split(' ')[1], 'base64').toString();
      this._logger.info({
        plainHeader: plainAuth
      }, "processing plain header");
      creds = plainAuth.split(':');
      return this.permissableMethod(creds[0], creds[1], method, gitObject);
    }
  }

  permissableMethod(username, password, method, gitObject) {
    var repoSplit = gitObject.repo.split('/');

    var gitRepo = repoSplit[1];
    if (gitRepo.length > 4) {
      gitRepo = gitRepo.indexOf('.git') === gitRepo.length - 4 ? gitRepo.slice(0, -4) : gitRepo;
    }
    var gitFolder = repoSplit[0];
    this._logger.info({
      gitFolder: gitFolder,
      gitRepo: gitRepo
    }, 'git credentials');
    return this.getUser(username, password)
      .then((user) => {
        if (!user) {
          throw new errors.Http401Error({
            message: 'incorrect Username or password provided'
          });
        }
        // check if user is in organisation
        return Organisation.findOneAsync({
          slug: gitFolder,
          _id: {
            $in: user.organisations
          }
        });
      }).then((org) => {
        if (!org) {
          this._logger.warn('unable to load organisation');
          throw new errors.Http500Error('No matching organisation found');
        }
        this._logger.info({
          org: org._id
        }, 'loaded organisation');
        //check if organisation has application

        return Application.findOneAsync({
          slug: gitRepo,
          organisation: org._id
        });
      }).then((app) => {
        if (!app) {
          this._logger.warn('unable to load application');
          throw new errors.Http500Error('No matching application found');
        }
        this._logger.info({
          app: app._id
        }, 'loaded app');
        return gitObject;
      });
  }

  getUser(username, password) {
    return HoistUser.findOneAsync({
      emailAddresses: {
        $elemMatch: {
          address: username.toLowerCase()
        }
      }
    }).then((user) => {
      if (user) {
        this._logger.info({
          user: user._id
        }, 'loaded user');
      } else {
        this._logger.warn('no user found');
      }
      if (user && user.passwordHash && user.passwordHash.length > 0 && user.verifyPassword(password)) {
        return user;
      } else if (user && (!user.passwordHash || user.passwordHash.length < 1)) {
        this._logger.warn('user doesn\'t have a password');
        throw new errors.user.credentials.NoPasswordError();
      } else {
        this._logger.warn('user doesnt exist or password wrong');
        return false;
      }
    });
  }

}



export default GitActionListener;
