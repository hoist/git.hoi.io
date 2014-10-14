'use strict';
require('../bootstrap');
var GitActionListener = require('../../lib/git_action_listener');
var sinon = require('sinon');
var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');

describe('GitActionListener', function () {
  var repos = {
    on: sinon.stub()
  };
  var gitListener;
  before(function () {
    gitListener = new GitActionListener();
    gitListener.bindToRepository(repos);
  });
  it('should subscribe to push events', function () {
    expect(repos.on)
      .to.have.been.calledWith('push');
  });
  describe('push', function () {
    describe('given an existing symlink hook', function () {
      var push = {
        cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
        accept: sinon.stub(),
        reject: sinon.stub()
      };
      before(function () {
        gitListener.push(push);
      });

      it('should call accept', function () {
        /* jshint -W030 */
        expect(push.accept)
          .to.have.been.called;
      });
    });
    describe('given an existing file hook', function () {
      var push = {
        cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
        accept: sinon.stub(),
        reject: sinon.stub()
      };
      before(function () {
        gitListener.push(push);
      });

      it('should call reject', function () {
        expect(push.reject)
          .to.have.been.calledWith(500, 'hook file already exists: ' + path.resolve(push.cwd, './hooks/post-receive'));
      });
    });
    describe('given no existing file hook', function () {
      var push = {
        cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
        accept: sinon.stub(),
        reject: sinon.stub()
      };
      before(function () {
        sinon.stub(fs, 'symlink').callsArg(2);
        gitListener.push(push);
      });

      it('should call accept', function () {
        /* jshint -W030 */
        expect(push.accept)
          .to.have.been.called;
      });
      it('should create symlink', function () {
        expect(fs.symlink)
          .to.have.been
          .calledWith(path.resolve(__dirname,'../../lib/hook.js'), path.resolve(push.cwd, './hooks/post-receive'));
      });
      after(function () {
        fs.symlink.restore();
      });
    });
  });
});
