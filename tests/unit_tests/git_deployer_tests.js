'use strict';
require('../bootstrap');
var moment = require('moment');
var sinon = require('sinon');
var fs = require('fs');
var expect = require('chai').expect;
var GitDeployer = require('../../lib/git_deployer');
var kue = require('kue');
var BBPromise = require('bluebird');
var path = require('path');
var errors = require('hoist-errors');
var config = require('config');
var rmdirRecursive = require('rmdir-recursive');
var Application = require('hoist-model').Application;

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
    describe('with a git repo that doesn\'t exist', function () {
      var loaded;
      before(function () {
        var deployer = new GitDeployer();
        loaded = deployer.loadHoistJson(path.resolve(__dirname, '../fixtures/not_here'));
      });
      it('throws git notfound error', function () {
        return expect(loaded)
          .to.be.rejectedWith(errors.git.NotFoundError);
      });
    });
    describe('with a git repo that doesn\'t have a master branch', function () {
      var loaded;
      before(function () {
        var deployer = new GitDeployer();
        loaded = deployer.loadHoistJson(path.resolve(__dirname, '../fixtures/repo_sans_hook'));
      });
      it('throws git invalid error', function () {
        return expect(loaded)
          .to.be.rejectedWith(errors.git.InvalidError);
      });
    });
    describe('with a git repo that doesn\'t contain a hoist.json', function () {
      var loaded;
      before(function () {
        var deployer = new GitDeployer();
        loaded = deployer.loadHoistJson(path.resolve(__dirname, '../fixtures/repo_with_file_hook'));
      });
      it('throws notfound error', function () {
        return expect(loaded)
          .to.be.rejectedWith(errors.files.hoistJson.NotFoundError);
      });
    });
  });
  describe('#getDetailsFromPath', function () {
    describe('using a full path', function () {
      var parsed;
      before(function () {
        var deployer = new GitDeployer();
        parsed = deployer.getDetailsFromPath(path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'));
      });
      it('returns organisation', function () {
        return parsed.then(function (details) {
          expect(details.organisationName)
            .to.eql('fixtures');
        });
      });
      it('returns subdomain', function () {
        return parsed.then(function (details) {
          expect(details.applicationSubDomain)
            .to.eql('repo_with_symlink_hook');
        });
      });
    });
  });
  describe('#updateConfig', function () {
    describe('with a valid save', function () {
      var application = new Application({
        settings: {
          dev: {
            setting: 'old'
          }
        }
      });
      var clock;
      before(function () {
        clock = sinon.useFakeTimers(moment().valueOf());
        var deployer = new GitDeployer();
        sinon.stub(deployer, 'getDetailsFromPath').returns(BBPromise.resolve({
          applicationSubDomain: 'subdomain'
        }));
        sinon.stub(deployer, 'loadHoistJson').returns(BBPromise.resolve({
          setting: 'new',
          sub: {
            'key': 'true'
          }
        }));
        sinon.stub(Application, 'findOneAsync').returns(BBPromise.resolve(application));
        sinon.stub(application, 'saveAsync').returns(BBPromise.resolve(null));
        deployer.updateConfig({
          log:sinon.stub(),
          path: '/path/to/repo',
          timestamp: moment()
        });
      });
      it('sets dev settings', function () {
        expect(application.settings.dev.setting)
          .to.eql('new');
      });
      it('sets deploy timestamp', function () {
        expect(application.lastDeploy.dev)
          .to.eql(moment().toDate());
      });
      it('saves', function () {
        /* jshint -W030 */
        expect(application.saveAsync)
          .to.have.been.called;
      });
      it('loads based on sub domain', function () {
        expect(Application.findOneAsync)
          .to.have.been.calledWith({
            subDomain: 'subdomain'
          });
      });
      after(function () {
        clock.restore();
        Application.findOneAsync.restore();
        application.saveAsync.restore();
      });

    });
  });
  describe('#deploy', function () {
    var deployer;
    var callback = sinon.stub();
    var job = {
      log: sinon.stub()
    };
    var clock;
    before(function (done) {
      clock = sinon.useFakeTimers(moment().valueOf());
      deployer = new GitDeployer();
      var p = BBPromise.resolve(null);
      sinon.stub(deployer, 'checkout').returns(p);
      sinon.stub(deployer, 'updateConfig').returns(p);
      deployer.deploy(job, callback).then(done);
    });
    after(function () {
      clock.restore();
    });
    it('adds timestamp', function () {
      expect(job.timestamp).to.eql(moment());
    });
    it('checks-out the git repository', function () {
      expect(deployer.checkout)
        .to.have.been.calledWith(job);
    });
    it('saves changed hoist.json', function () {
      expect(deployer.updateConfig)
        .to.have.been.calledWith(job);
    });
    it('creates job log', function () {
      /* jshint -W030 */
      expect(job.log)
        .to.have.been.called;
    });
    it('completes', function () {
      /* jshint -W030 */
      expect(callback)
        .to.have.been.called;
    });
  });
  describe('#checkout', function () {
    var checkedOut;
    var clock;
    before(function () {
      var deployer = new GitDeployer();
      config.util.setModuleDefaults('Hoist', {
        git: {
          repository: {
            root: path.resolve(__dirname, '../fixtures/')
          }
        },
        executor: {
          root: path.resolve(__dirname, '../fixtures/checkouts')
        }
      });
      clock = sinon.useFakeTimers(moment().valueOf());

      checkedOut = deployer.checkout({
        path: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
        timestamp: moment(),
        log:sinon.stub()
      });
    });
    after(function (done) {
      clock.restore();
      rmdirRecursive(path.resolve(__dirname, '../fixtures/checkouts'), done);
    });
    it('creates directory', function () {
      return checkedOut.then(function () {
        expect(fs.existsSync(path.resolve(__dirname, '../fixtures/checkouts/fixtures/repo_with_symlink_hook/' + moment().format('X') + '/hoist.json')))
          .to.eql(true);
      });
    });

  });
});
