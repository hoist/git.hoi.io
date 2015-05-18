  'use strict';

require('../bootstrap');
var moment = require('moment');
var sinon = require('sinon');
var fs = require('fs');
var expect = require('chai').expect;
var Agenda = require('agenda');
var BBPromise = require('bluebird');
var path = require('path');
var errors = require('hoist-errors');
var config = require('config');
var rmdirRecursive = require('rmdir-recursive');
var Application = require('hoist-model').Application;
var Organisation = require('hoist-model').Organisation;
var ExecutionLogEvent = require('hoist-model').ExecutionLogEvent;
var mongoose = require('hoist-model')._mongoose;
var _ = require('lodash');
var dnode = require('dnode');
var DNode = require('dnode/lib/dnode');

describe('GitDeployer', function () {
  describe('#start', function () {

    var deployer;
    before(function (done) {
      sinon.stub(DNode.prototype, 'listen');

      var GitDeployer = require('../../lib/git_deployer');
      deployer = new GitDeployer();

      sinon.stub(mongoose, 'connect').callsArg(1);
      deployer.start(done);
    });
    after(function () {
      DNode.prototype.listen.restore();
      mongoose.connect.restore();
    });
    it('connects to mongo', function () {
      expect(mongoose.connect)
        .to.have.been.calledWith('mongodb://localhost/hoist-default');
    });
  });
  describe('#stop', function () {
    var deployer;
    var originalConnections;
    before(function (done) {
      var GitDeployer = require('../../lib/git_deployer');
      deployer = new GitDeployer();
      deployer.dnodeServer = dnode({});

      originalConnections = mongoose.connections;
      mongoose.connections = [];
      mongoose.connections.push({
        readyState: 1
      });
      sinon.stub(mongoose, 'disconnect').callsArg(0);
      deployer.stop(done);
    });
    after(function () {
      mongoose.connections = originalConnections;
      mongoose.disconnect.restore();
    });
    it('disconnects from mongo', function () {

      return expect(mongoose.disconnect)
        .to.have.been.called;
    });

  });
  describe('#loadHoistJson', function () {
    describe('with a valid git repo', function () {
      var loaded;
      before(function () {
        var GitDeployer = require('../../lib/git_deployer');
        var deployer = new GitDeployer();
        loaded = deployer.loadHoistJson(path.resolve(__dirname, '../fixtures/repo_with_symlink_hook.git'), sinon.stub());
      });
      it('loads the content of hoist.json', function () {
        return loaded.then(function (json) {

          return expect(json.modules[0])
            .to.exist;
        });
      });
    });
    describe('with a git repo that doesn\'t exist', function () {
      var loaded;
      before(function () {
        var GitDeployer = require('../../lib/git_deployer');
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
        var GitDeployer = require('../../lib/git_deployer');
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
        var GitDeployer = require('../../lib/git_deployer');
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
        var GitDeployer = require('../../lib/git_deployer');
        var deployer = new GitDeployer();
        parsed = deployer.getDetailsFromPath(path.resolve(__dirname, '../fixtures/repo_with_symlink_hook.git'));
      });
      it('returns organisation', function () {
        return parsed.then(function (details) {
          expect(details.folderName)
            .to.eql('fixtures');
        });
      });
      it('returns subdomain', function () {
        return parsed.then(function (details) {
          expect(details.repoName)
            .to.eql('repo_with_symlink_hook');
        });
      });
    });
  });
  describe('#logToDeveloperConsole', function () {
    describe('using a full path', function () {
      var parsed;
      var job;
      before(function () {
        var GitDeployer = require('../../lib/git_deployer');
        var deployer = new GitDeployer();
        sinon.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve({
          _id: 'abc'
        }));
        sinon.stub(Application, 'findOneAsync').returns(BBPromise.resolve({
          _id: 'abc'
        }));
        sinon.stub(ExecutionLogEvent.prototype, 'saveAsync').returns(BBPromise.resolve({}));
        job = {
          path: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook.git')
        };
        parsed = deployer.logToDeveloperConsole('Deploy', job);
      });
      it('returns job', function () {
        return parsed.then(function (returnedJob) {
          console.log(returnedJob);
          expect(returnedJob.path)
            .to.eql(job.path);
        });
      });
      after(function() {
        Application.findOneAsync.restore();
        Organisation.findOneAsync.restore();
      });
    });
  });
  describe('#updateConfig', function () {
    describe('with a valid save', function () {
      var application = new Application({
        settings: {
          live: {
            setting: 'old'
          }
        }
      });
      var org = new Organisation({
        _id: 'org'
      });
      var clock;
      before(function () {
        clock = sinon.useFakeTimers(moment().valueOf());
        var GitDeployer = require('../../lib/git_deployer');
        var deployer = new GitDeployer();
        sinon.stub(deployer, 'getDetailsFromPath').returns(BBPromise.resolve({
          folderName: 'folder',
          repoName: 'subdomain'
        }));
        sinon.stub(deployer, 'loadHoistJson').returns(BBPromise.resolve({
          setting: 'new',
          sub: {
            'key': 'true'
          }
        }));
        sinon.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
        sinon.stub(Application, 'findOneAsync').returns(BBPromise.resolve(application));
        sinon.stub(application, 'saveAsync').returns(BBPromise.resolve(null));
        deployer.updateConfig({
          log: sinon.stub(),
          path: '/path/to/repo',
          timestamp: moment()
        });
      });
      it('loads org based on folder name', function () {
        expect(Organisation.findOneAsync)
          .to.have.been.calledWith({
            slug: 'folder'
          });
      });
      it('sets live settings', function () {
        expect(application.settings.live.setting)
          .to.eql('new');
      });
      it('sets deploy timestamp', function () {
        expect(application.lastDeploy.live)
          .to.eql(moment().toDate());
      });
      it('saves', function () {

        return expect(application.saveAsync)
          .to.have.been.called;
      });
      it('loads based on gitRepo', function () {
        expect(Application.findOneAsync)
          .to.have.been.calledWith({
            organisation: 'org',
            slug: 'subdomain'
          });
      });
      after(function () {
        clock.restore();
        Application.findOneAsync.restore();
        Organisation.findOneAsync.restore();
        application.saveAsync.restore();
      });

    });
  });
  describe('#deploy', function () {
    var deployer;
    var job = {};
    var logStub = sinon.stub();
    var clock;
    before(function (done) {
      clock = sinon.useFakeTimers(moment().valueOf());
      var GitDeployer = require('../../lib/git_deployer');
      deployer = new GitDeployer();
      var p = BBPromise.resolve(null);
      sinon.stub(deployer, 'checkout').returns(p);
      sinon.stub(deployer, 'updateConfig').returns([p]);
      sinon.stub(deployer, 'npm').returns(p);
      sinon.stub(deployer, 'updateSchedules').returns(p);
      sinon.stub(deployer, 'clearOldDirectories').returns(p);
      sinon.stub(deployer, 'deployFiles').returns(p);
      sinon.stub(deployer, 'logToDeveloperConsole').returns(p);
      return deployer.deploy(job, logStub, logStub, done);
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

      return expect(logStub)
        .to.have.been.called;
    });
  });
  describe('#checkout', function () {
    var checkedOut;
    var clock;
    before(function () {
      var GitDeployer = require('../../lib/git_deployer');
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
        path: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook.git'),
        timestamp: moment(),
        log: sinon.stub(),
        write: sinon.stub()
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
  describe('#updateSchedules', function () {
    var stubJob = {
      save: sinon.stub().callsArg(0),
      repeatEvery: sinon.stub(),
      computeNextRunAt: sinon.stub()
    };
    before(function () {
      sinon.stub(Agenda.prototype, 'cancel').callsArgWith(1, null, 1);
      sinon.stub(Agenda.prototype, 'create').returns(stubJob);
      sinon.stub(Agenda.prototype, 'database').returnsThis();
      var job = {
        log: sinon.stub()
      };
      var GitDeployer = require('../../lib/git_deployer');
      var deployer = new GitDeployer();
      var application = new Application({
        _id: 'appid',
        settings: {
          live: {
            schedules: {
              '0 0 * * *': {
                'events': [
                  'nightly:batch:start'
                ]
              },
              '10 0 * * *': {
                'events': [
                  'nightly:batch:start',
                  'nightly:batch:stop'
                ]
              }
            }
          }
        }
      });
      return deployer.updateSchedules(job, application);
    });
    after(function () {
      Agenda.prototype.create.restore();
      Agenda.prototype.cancel.restore();
    });
    it('removes existing schedules', function () {
      return expect(Agenda.prototype.cancel)
        .to.have.been.calledWith({
          'data.application': 'appid'
        });
    });
    it('registers new schedules', function () {
      expect(Agenda.prototype.create)
        .to.have.been.calledWith('create:event', {
          events: ['nightly:batch:start'],
          application: 'appid',
          environment: 'live'
        }).and.calledWith('create:event', {
          events: ['nightly:batch:start', 'nightly:batch:stop'],
          application: 'appid',
          environment: 'live'
        });
    });
    it('sets correct schedules', function () {
      expect(stubJob.repeatEvery)
        .to.have.been.calledWith('10 0 * * *').and.calledWith('0 0 * * *');
    });
  });
  describe('#clearDirectories', function () {
    var basePath = path.resolve(__dirname, '../fixtures/checkouts');
    before(function () {
      var GitDeployer = require('../../lib/git_deployer');
      var deployer = new GitDeployer();
      var mkdirp = BBPromise.promisify(require('mkdirp'));
      return BBPromise.all(_.map(_.range(5), function (num) {
        return mkdirp(path.join(basePath, num + ''));
      })).then(function () {
        return mkdirp(path.join(basePath, '.npmcache'));
      }).then(function () {
        return deployer.clearDirectories(basePath);
      });
    });
    it('keeps largest three directories', function () {
      expect(fs.existsSync(path.join(basePath, '2'))).to.eql(true);
      expect(fs.existsSync(path.join(basePath, '3'))).to.eql(true);
      expect(fs.existsSync(path.join(basePath, '4'))).to.eql(true);
    });
    it('deletes directories', function () {
      expect(fs.existsSync(path.join(basePath, '0'))).to.eql(false);
      expect(fs.existsSync(path.join(basePath, '1'))).to.eql(false);
    });
    it('keeps .npmcache dir', function () {
      expect(fs.existsSync(path.join(basePath, '.npmcache'))).to.eql(true);
    });
    after(function (done) {
      rmdirRecursive(path.resolve(__dirname, '../fixtures/checkouts'), done);
    });
  });
  describe('#clearOldDirectories', function () {
    var GitDeployer = require('../../lib/git_deployer');
    var deployer = new GitDeployer();
    before(function () {

      sinon.stub(deployer, 'clearDirectories').returns(BBPromise.resolve(null));
      return deployer.clearOldDirectories({
        path: '/path/to/repo'
      });

    });
    it('clears checkout directories', function () {
      expect(deployer.clearDirectories)
        .to.be.calledWith('tests/fixtures/checkouts/to/repo');
    });
    it('clears deployment directories', function () {
      expect(deployer.clearDirectories)
        .to.be.calledWith('tests/fixtures/deploys/to/repo');
    });
  });
  describe('#deployFiles', function () {
    var fs = require('fs-extra');
    var timestamp = moment();
    before(function () {
      sinon.stub(fs, 'copy').callsArg(2);
      sinon.stub(fs, 'symlink').callsArg(2);
      var GitDeployer = require('../../lib/git_deployer');
      var deployer = new GitDeployer();
      return deployer.deployFiles({
        timestamp: timestamp,
        path: '/path/to/repo',
        write: sinon.stub(),
        log: sinon.stub()
      });
    });
    after(function () {
      fs.copy.restore();
    });
    it('copies directories', function () {
      expect(fs.copy).to.have.been.calledWith('tests/fixtures/checkouts/to/repo/' + timestamp.format('X'), 'tests/fixtures/deploys/to/repo/' + timestamp.format('X'));
    });

  });
});
