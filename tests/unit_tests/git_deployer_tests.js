'use strict';
require('../bootstrap');
var sinon = require('sinon');
var expect = require('chai').expect;
var GitDeployer = require('../../lib/git_deployer');
var kue = require('kue');
var BBPromise = require('bluebird');
var path = require('path');
describe('GitDeployer', function () {
  describe('#start', function () {
    var stubQueue = {
      process: sinon.stub()
    };
    var deployer;
    before(function () {
      sinon.stub(kue, 'createQueue').returns(stubQueue);
      deployer = new GitDeployer();
      deployer.start();
    });
    after(function () {
      kue.createQueue.restore();
    });

    it('listens for GitPush jobs', function () {
      expect(stubQueue.process)
        .to.have.been.calledWith('GitPush');
    });
    it('maps GitPush jobs to #deploy', function () {
      expect(stubQueue.process.firstCall.args[2])
        .to.eql(deployer.deploy);
    });
  });
  describe('#loadHoistJson', function () {
    describe('with a valid git repo', function () {
      var loaded;
      before(function () {
        var deployer = new GitDeployer();
        loaded = deployer.loadHoistJson(path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'));
      });
      it('loads the content of hoist.json', function () {
        return loaded.then(function (json) {
          /* jshint -W030 */
          expect(json.modules[0])
            .to.exist;
        });
      });
    });
  });
  describe('#deploy', function () {
    var deployer;
    var callback = sinon.stub();
    var job = {};
    before(function (done) {
      deployer = new GitDeployer();
      var p = BBPromise.resolve(null);
      sinon.stub(deployer, 'checkout').returns(p);
      sinon.stub(deployer, 'updateConfig').returns(p);
      sinon.stub(deployer, 'restartExecutor').returns(p);
      deployer.deploy(job, callback).then(done);
    });
    it('checks-out the git repository', function () {
      expect(deployer.checkout)
        .to.have.been.calledWith(job);
    });
    it('saves changed hoist.json', function () {
      expect(deployer.updateConfig)
        .to.have.been.calledWith(job);
    });
    it('starts exectutor process', function () {
      expect(deployer.restartExecutor)
        .to.have.been.calledWith(job);
    });
    it('completes', function () {
      /* jshint -W030 */
      expect(callback)
        .to.have.been.called;
    });
  });
});
