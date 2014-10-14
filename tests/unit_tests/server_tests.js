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
  before(function () {
    sinon.stub(GitActionListener.prototype,'bindToRepository');
    sinon.stub(http, 'createServer').returns(server);
    require('../../lib/server');
  });
  after(function(){
    http.createServer.restore();
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
  it('should bind to repository',function(){
    /* jshint -W030 */
    expect(GitActionListener.prototype.bindToRepository)
    .to.have.been.called;
  });
});
