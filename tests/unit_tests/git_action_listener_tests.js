'use strict';
require('../bootstrap');
var GitActionListener = require('../../lib/git_action_listener');
var sinon = require('sinon');
var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');
var hoistModel = require('hoist-model');
var User = hoistModel.User;
var Organisation = hoistModel.Organisation;
var Application = hoistModel.Application;
var BBPromise = require('bluebird');

describe.only('GitActionListener', function () {

  this.timeout(2000);
  var repos = {
    on: sinon.stub()
  };
  var gitListener;
  var username = 'test@hoi.io';
  var password = 'password';

  var user = new User({
    emailAddresses: [{
      address: username
    }]
  });
  var org = new Organisation({
    name: 'org',
  });
  var app = new Application({
    name: 'app',
  });

  before(function () {
    gitListener = new GitActionListener();
    gitListener.bindToRepository(repos);
    return user.setPassword(password);
  });

  it('should subscribe to push events', function () {
    expect(repos.on)
      .to.have.been.calledWith('push');
  });
  describe('push', function () {
    var sandbox;
    describe('given an existing symlink hook', function () {
      describe('with valid authorization', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
          sandbox.stub(Application, 'findOneAsync').returns(BBPromise.resolve(app));
          return gitListener.push(push);
        });

        it('should call accept', function () {
          /* jshint -W030 */
          expect(push.accept)
            .to.have.been.called;
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with incorrect username', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer('fakeusername' + ':' + 'fakepassword').toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('incorrect password', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + 'fakepassword').toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with no authorization', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {}
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with invalid organisation', function () {
        var push = {
          repo: 'fake/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with invalid application', function () {
        var push = {
          repo: 'fake/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_symlink_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
          sandbox.stub(Application, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
    });
    describe('given an existing file hook', function () {
      describe('with valid authorization', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
          sandbox.stub(Application, 'findOneAsync').returns(BBPromise.resolve(app));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          expect(push.reject)
            .to.have.been.calledWith(500, 'hook file already exists: ' + path.resolve(push.cwd, './hooks/post-receive'));
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with incorrect username', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer('fakeusername' + ':' + 'fakepassword').toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('incorrect password', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + 'fakepassword').toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with no authorization', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {}
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with invalid organisation', function () {
        var push = {
          repo: 'fake/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with invalid application', function () {
        var push = {
          repo: 'fake/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_with_file_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
          sandbox.stub(Application, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
    });
    describe('given no existing file hook', function () {
      describe('with valid authorization', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(fs, 'symlink').callsArg(2);
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
          sandbox.stub(Application, 'findOneAsync').returns(BBPromise.resolve(app));
          return gitListener.push(push);
        });

        it('should call accept', function () {
          /* jshint -W030 */
          expect(push.accept)
            .to.have.been.called;
        });
        it('should create symlink', function () {
          expect(fs.symlink)
            .to.have.been
            .calledWith(path.resolve(__dirname, '../../lib/hook.js'), path.resolve(push.cwd, './hooks/post-receive'));
        });
        after(function () {
          sandbox.restore();
        });
      });
      describe('with incorrect username', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer('fakeusername' + ':' + 'fakepassword').toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('incorrect password', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + 'fakepassword').toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with no authorization', function () {
        var push = {
          repo: 'org/app',
          request: {
            headers: {}
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with invalid organisation', function () {
        var push = {
          repo: 'fake/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
      describe('with invalid application', function () {
        var push = {
          repo: 'fake/app',
          request: {
            headers: {
              authorization: 'basic ' + new Buffer(username + ':' + password).toString('base64')
            }
          },
          cwd: path.resolve(__dirname, '../fixtures/repo_sans_hook'),
          accept: sinon.stub(),
          reject: sinon.stub()
        };
        before(function () {
          sandbox = sinon.sandbox.create();
          sandbox.stub(User, 'findOneAsync').returns(BBPromise.resolve(user));
          sandbox.stub(Organisation, 'findOneAsync').returns(BBPromise.resolve(org));
          sandbox.stub(Application, 'findOneAsync').returns(BBPromise.resolve(null));
          return gitListener.push(push);
        });

        it('should call reject', function () {
          /* jshint -W030 */
          expect(push.reject)
            .to.have.been.calledWith(401, 'Bad request');
        });

        after(function () {
          sandbox.restore();
        });
      });
    });
  });
});