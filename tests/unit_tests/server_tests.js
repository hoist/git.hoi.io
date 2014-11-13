'use strict';
require('../bootstrap');
var sinon = require('sinon');
var expect = require('chai').expect;
var http = require('http');
var BBPromise = require('bluebird');
var GitActionListener = require('../../lib/git_action_listener');
var mongoose = require('hoist-model')._mongoose;
var hoistServer = require('../../lib/server');

describe('server', function () {
  describe('#stop', function () {
    describe('with active mongo connection', function () {
      var server = {
        close: sinon.stub().callsArg(0)
      };
      var _originalConnections;
      before(function (done) {
        sinon.stub(mongoose, 'disconnect').callsArg(0);
        _originalConnections = mongoose.connections;
        mongoose.connections = [];
        mongoose.connections.push({
          readyState: 1
        });
        hoistServer._server = BBPromise.promisifyAll(server);
        hoistServer.stop(done);
      });
      after(function () {
        delete hoistServer._server;
        mongoose.connections = _originalConnections;
      });
      it('disconnects mongo', function () {
        /* jshint -W030 */
        expect(mongoose.disconnect)
          .to.have.been.called;
      });
    });
  });
  describe('#start', function () {
    describe('with active connection', function () {
      var server = {
        listen: sinon.stub().callsArg(1)
      };
      var _repos;
      var _originalConnections;
      before(function (done) {
        sinon.stub(GitActionListener.prototype, 'bindToRepository', function (repos) {
          _repos = repos;
          sinon.stub(_repos, 'handle');
        });
        sinon.stub(mongoose, 'connect').callsArg(1);
        sinon.stub(http, 'createServer').returns(server);
        _originalConnections = mongoose.connections;
        mongoose.connections = [];
        mongoose.connections.push({
          readyState: 1
        });
        hoistServer.start(done);
      });
      after(function () {
        delete hoistServer._server;
        http.createServer.restore();
        mongoose.connect.restore();
        mongoose.connections = _originalConnections;
        GitActionListener.prototype.bindToRepository.restore();
        _repos.handle.restore();
      });
      it('doesn\'t reconnect to mongo', function () {
        /*jshint -W030 */
        expect(mongoose.connect)
          .to.have
          .not.been.called;
      });
      it('creates a server', function () {
        /* jshint -W030 */
        expect(http.createServer)
          .to.have.been.called;
      });
      it('listens', function () {
        /* jshint -W030 */
        expect(server.listen)
          .to.have.been.called;
      });
      it('binds to repository', function () {
        /* jshint -W030 */
        expect(GitActionListener.prototype.bindToRepository)
          .to.have.been.called;
      });
    });
    describe('with no active connection', function () {
      var server = {
        listen: sinon.stub().callsArg(1)
      };
      var _repos;
      before(function (done) {
        sinon.stub(GitActionListener.prototype, 'bindToRepository', function (repos) {
          _repos = repos;
          sinon.stub(_repos, 'handle');
        });
        sinon.stub(mongoose, 'connect').callsArg(1);
        sinon.stub(http, 'createServer').returns(server);
        hoistServer.start(done);
      });
      after(function () {
        delete hoistServer._server;
        http.createServer.restore();
        mongoose.connect.restore();
        GitActionListener.prototype.bindToRepository.restore();
        _repos.handle.restore();
      });
      it('connects to mongo', function () {
        expect(mongoose.connect)
          .to.have.been.calledWith('mongodb://localhost/hoist-default');
      });
      it('creates a server', function () {
        /* jshint -W030 */
        expect(http.createServer)
          .to.have.been.called;
      });
      it('listens', function () {
        /* jshint -W030 */
        expect(server.listen)
          .to.have.been.called;
      });
      it('binds to repository', function () {
        /* jshint -W030 */
        expect(GitActionListener.prototype.bindToRepository)
          .to.have.been.called;
      });
      describe('on request', function () {
        var req = {headers:{
          authorization:'auth'
        }};
        var res = {
          };
        before(function () {
          http.createServer.callArgWith(0, req, res);
        });
        it('passes req and res to repos', function () {
          expect(_repos.handle)
            .to.have.been.calledWith(req, res);
        });
      });
    });
  });
});
