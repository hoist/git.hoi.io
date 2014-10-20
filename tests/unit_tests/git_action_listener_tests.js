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

      it('should call accept', function () {
        /* jshint -W030 */
        expect(push.accept)
          .to.have.been.called;
      });
    });
    describe('given no existing file hook', function () {
      var push = {
        cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
        accept: sinon.stub(),
        reject: sinon.stub()
      };
      before(function (done) {
        push.accept = done;
        gitListener.push(push);
      });
      it('should create hook file', function () {
        expect(fs.existsSync(path.resolve(push.cwd, './hooks/post-receive')))
          .to.eql(true);
      });
      it('makes executable file', function () {
        expect(fs.statSync(path.resolve(push.cwd, './hooks/post-receive')).mode)
        .to.eql(33261);
      });
      it('substitues path', function () {
        expect(fs.readFileSync(path.resolve(push.cwd, './hooks/post-receive'), {
          encoding: 'utf8'
        }))
          .to.contain(path.resolve(__dirname,'../../lib/hook.js'));
      });
      after(function () {
        fs.unlinkSync(path.resolve(push.cwd, './hooks/post-receive'));
      });
    });
  });
});
