'use strict';
var sinon = require('sinon');
var dnode = require('dnode');
var expect = require('chai').expect;

describe('post-receive hook', function () {
  var clock;
  var stubRemote = {};
  stubRemote.on = sinon.stub();
  stubRemote.end = sinon.stub();
  stubRemote.deploy = sinon.stub();


  before(function () {
    clock = sinon.useFakeTimers();
    sinon.stub(console, 'log');
    stubRemote.on.onCall(0).callsArgWith(1, stubRemote);
    sinon.stub(dnode, 'connect', function () {
      return stubRemote;
    });
    sinon.stub(process, 'exit');
    require('../../lib/hook');
    console.log.restore();
  });
  after(function () {
    clock.restore();
    process.exit.restore();
    dnode.connect.restore();
  });
  it('logs message sent to first function', function () {
    /* jshint -W030 */
    sinon.stub(process.stdout, 'write');
    stubRemote.deploy.callArgWith(1, 'this is a message');
    expect(process.stdout.write)
      .to.have.been.calledWith('\x1b[1Gthis is a message\n');
    process.stdout.write.restore();
  });
  it('calls deploy', function () {
    expect(stubRemote.deploy)
      .to.have.been.calledWith({
        path: process.cwd()
      }, sinon.match.func, sinon.match.func);
  });
  describe('on end', function () {
    before(function () {
      stubRemote.deploy.callArg(3);
    });
    it('exits process with a 0 exit code', function () {
      expect(process.exit)
        .to.have.been.calledWith(0);
    });
  });
  describe('on failure', function () {
    before(function () {
      stubRemote.deploy.callArgWith(3, new Error('an error occured'));
    });
    it('exits process with a non 0 exit code', function () {
      expect(process.exit)
        .to.have.been.calledWith(1);
    });
  });
});
