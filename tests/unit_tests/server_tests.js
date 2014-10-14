'use strict';
require('../bootstrap');
var sinon = require('sinon');
var expect = require('chai').expect;
var http = require('http');
var GitActionListener = require('../../lib/git_action_listener');
describe('server', function () {
  var server = {
    listen: sinon.stub()
  };
  var _repos;
  before(function () {
    sinon.stub(GitActionListener.prototype, 'bindToRepository', function (repos) {
      _repos = repos;
      sinon.stub(_repos, 'handle');
    });
    sinon.stub(http, 'createServer').returns(server);
    require('../../lib/server');
  });
  after(function () {
    http.createServer.restore();
    GitActionListener.prototype.bindToRepository.restore();
    _repos.handle.restore();
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
    var req = {};
    var res = {};
    before(function () {
      http.createServer.callArgWith(0, req, res);
    });
    it('passes req and res to repos', function () {
      expect(_repos.handle)
        .to.have.been.calledWith(req, res);
    });
  });
});
