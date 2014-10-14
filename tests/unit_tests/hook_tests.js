'use strict';
var sinon = require('sinon');
var kue = require('kue');
var expect = require('chai').expect;

describe('post-receive hook', function () {
  var clock;
  var stubQueue = {};
  stubQueue.create = sinon.stub().returns(stubQueue);
  stubQueue.priority = sinon.stub().returns(stubQueue);
  stubQueue.attempts = sinon.stub().returns(stubQueue);
  stubQueue.on = sinon.stub();
  stubQueue.save = sinon.stub();
  stubQueue.shutdown = sinon.stub().callsArg(0);


  before(function () {
    clock = sinon.useFakeTimers();
    sinon.stub(console, 'log');
    sinon.stub(kue.Job, 'log');
    sinon.stub(kue, 'createQueue', function () {
      return stubQueue;
    });
    sinon.stub(process, 'exit');
    require('../../lib/hook');
    console.log.restore();
  });
  after(function () {
    clock.restore();
    process.exit.restore();
    kue.Job.log.restore();
    kue.createQueue.restore();
  });
  it('should poll for log messages every 500 ms', function () {
    clock.tick(450);
    /* jshint -W030 */
    expect(kue.Job.log)
      .to.have.not.been.called;
    clock.tick(100);
    expect(kue.Job.log)
      .to.have.been.called;
  });
  it('should log only new log messages', function () {
    sinon.stub(console, 'log');
    //make sure we have at least three calls to retrieve logs
    clock.tick(1500);
    //initial log messages
    var log = ['message 1', 'message 2'];
    var call1 = kue.Job.log.getCall(0);
    var call2 = kue.Job.log.getCall(1);
    var call3 = kue.Job.log.getCall(2);
    call1.args[1](null, log);
    call2.args[1](null, log);
    //add a log message
    log = log.slice(0);
    log.push('message 3');
    call3.args[1](null, log);
    /* jshint -W030 */
    expect(console.log).to.have.been.calledThrice;
    console.log.restore();
  });
  it('should create a GitPush job', function () {
    expect(stubQueue.create)
      .to.have.been.calledWith('GitPush', {
        path: process.cwd()
      });
  });
  it('should subscribe to complete', function () {
    expect(stubQueue.on)
      .to.have.been.calledWith('complete');
  });
  it('should subscribe to failed', function () {
    expect(stubQueue.on)
      .to.have.been.calledWith('failed');
  });
  describe('on complete', function () {
    before(function () {
      sinon.stub(console, 'log');
      kue.Job.log.reset();
      for (var i = 0; i < stubQueue.on.callCount; i++) {
        var call = stubQueue.on.getCall(i);
        if (call.args[0] === 'complete') {
          call.args[1]();
          break;
        }
      }
      kue.Job.log.callArgWith(1, null, []);
      console.log.restore();
    });
    it('should shutdown kue', function () {
      /* jshint -W030 */
      expect(stubQueue.shutdown)
        .to.have.been.called;
    });
    it('should exit process with a 0 exit code', function () {
      expect(process.exit)
        .to.have.been.calledWith(0);
    });
  });
  describe('on failure', function () {
    before(function () {
      sinon.stub(console, 'log');
      kue.Job.log.reset();
      for (var i = 0; i < stubQueue.on.callCount; i++) {
        var call = stubQueue.on.getCall(i);
        if (call.args[0] === 'failed') {
          call.args[1]();
          break;
        }
      }
      kue.Job.log.callArgWith(1, null, []);
      console.log.restore();
    });
    it('should shutdown kue', function () {
      /* jshint -W030 */
      expect(stubQueue.shutdown)
        .to.have.been.called;
    });
    it('should exit process with a non 0 exit code', function () {
      expect(process.exit)
        .to.have.been.calledWith(1);
    });
  });
});
