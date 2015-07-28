'use strict';
import {
  expect
}
from 'chai';
import sinon from 'sinon';
import GitActionListener from '../../lib/git_action_listener';
import path from 'path';
import fs from 'fs';
import {
  HoistUser, Organisation, Application
}
from '@hoist/model';
/** @test {GitActionListener} */
describe('GitActionListener', () => {
  let gitActionListener;
  before(() => {
    gitActionListener = new GitActionListener();
  });
  /** @test {GitActionListener#bindToRepository} */
  describe('GitActionListener#bindToRepository', () => {
    let stubRepos = {
      on: sinon.stub()
    };
    before(() => {
      sinon.stub(gitActionListener, 'push');
      gitActionListener.bindToRepository(stubRepos);
    });
    after(() => {
      gitActionListener.push.restore();
    });
    it('binds push event to the #push method', () => {
      let pushObject = {};
      return Promise.resolve()
        .then(() => {
          stubRepos.on.yield(pushObject);
        }).then(() => {
          return expect(gitActionListener.push).to.have.been.calledWith(pushObject);
        });
    });
  });
  /** @test {GitActionListener#createHookFile} */
  describe('GitActionListener#createHookFile', () => {
    let target = 'temp_hook_file';
    before(() => {
      let template = path.resolve(__dirname, '../../lib/hook-include.sh');
      return gitActionListener.createHookFile(template, target);
    });
    it('should create link to hook-file', () => {
      let hookCall = `node "${path.resolve(__dirname, '../../lib/hook.js')}"`;
      return expect(fs.readFileSync(target, 'utf8')).to.contain(hookCall);
    });
  });
  describe('GitActionListener#push', () => {
    let username = 'test@Hoist.io';
    let password = 'test';
    let mockPush = {
      reject: sinon.stub(),
      accept: sinon.stub(),
      cwd: path.resolve(__dirname),
      repo: "org/app.git",
      request: {
        headers: {
          authorization: 'Basic ' + new Buffer(username + ":" + password, "utf8").toString("base64")
        }
      }
    };
    let organisation;
    let application;
    let user;
    before(() => {
      organisation = new Organisation({
        _id: 'org-id',
        slug: 'org'
      });
      application = new Application({
        organiation: organisation
      });
      user = new HoistUser({
        emailAddresses: [{
          address: username
        }],
        organisations: [organisation._id]
      });

      sinon.stub(HoistUser, 'findOneAsync').returns(Promise.resolve(user));
      sinon.stub(Application, 'findOneAsync').returns(Promise.resolve(application));
      sinon.stub(Organisation, 'findOneAsync').returns(Promise.resolve(organisation));
      sinon.stub(gitActionListener, 'createHookFile');
      sinon.stub(fs, 'unlink');
      return user.setPassword(password);
    });
    after(() => {
      fs.unlink.restore();
      gitActionListener.createHookFile.restore();
      Organisation.findOneAsync.restore();
      Application.findOneAsync.restore();
      HoistUser.findOneAsync.restore();
    });
    describe('if has access to repository', () => {

      before(() => {
        return gitActionListener.push(mockPush);
      });
      after(() => {
        mockPush.accept.reset();
      });
      it('accepts the push', () => {
        return expect(mockPush.accept).to.have.been.called;
      });
      it('queries for lower lower case email addres', () => {
        return expect(HoistUser.findOneAsync)
          .to.have.been.calledWith({
            emailAddresses: {
              $elemMatch: {
                address: 'test@hoist.io'
              }
            }
          });
      });
      it('queries for organisation user has access to', () => {
        return expect(Organisation.findOneAsync)
          .to.have.been.calledWith({
            slug: 'org',
            _id: {
              $in: user.organisations
            }
          });
      });
      it('queries correct application', () => {
        return expect(Application.findOneAsync)
          .to.have.been.calledWith({
            organisation: 'org-id',
            slug: 'app'
          });
      });
      it('creates the hook file', () => {
        return expect(gitActionListener.createHookFile)
          .to.have.been.calledWith(
            path.resolve(__dirname, '../../lib/hook-include.sh'),
            path.resolve(__dirname, './hooks/pre-receive'));
      });
    });
    describe('if push is made without auth header', () => {
      let originalHeader;
      before(() => {
        originalHeader = mockPush.request.headers.authorization;
        delete mockPush.request.headers.authorization;
        return gitActionListener.push(mockPush);
      });
      after(() => {
        mockPush.request.headers.authorization = originalHeader;
        mockPush.reject.reset();
      });
      it('rejects the push with a 401 error', () => {
        return expect(mockPush.reject)
          .to.have.been.calledWith(401, 'Missing Authentication Header');
      });
    });
    describe('if user doesn\'t have access to repository', () => {
      before(() => {
        Organisation.findOneAsync.returns(Promise.resolve(null));
        return gitActionListener.push(mockPush);
      });
      after(() => {
        mockPush.reject.reset();
        Organisation.findOneAsync.returns(Promise.resolve(organisation));
      });
      it('rejects the push with a 401 error', () => {
        return expect(mockPush.reject)
          .to.have.been.calledWith(401, `The specified user doesn't have access to this repository, or the repository doesn't exist`);
      });
    });
    describe('if username is wrong', () => {

      before(() => {
        HoistUser.findOneAsync.returns(Promise.resolve(null));
        return gitActionListener.push(mockPush);
      });
      after(() => {
        HoistUser.findOneAsync.returns(Promise.resolve(user));
        mockPush.reject.reset();
      });
      it('rejects the push with a 401 error', () => {
        return expect(mockPush.reject)
          .to.have.been.calledWith(401, `Incorrect username or password provided`);
      });
    });
    describe('if password is wrong', () => {
      let originalHeader;
      before(() => {
        originalHeader = mockPush.request.headers.authorization;
        mockPush.request.headers.authorization = 'Basic ' + new Buffer(username + ":" + 'bad-password', "utf8").toString("base64");
        return gitActionListener.push(mockPush);
      });
      after(() => {
        mockPush.request.headers.authorization = originalHeader;
        mockPush.reject.reset();
      });
      it('rejects the push with a 401 error', () => {
        return expect(mockPush.reject)
          .to.have.been.calledWith(401, `Incorrect username or password provided`);
      });
    });
  });
});
