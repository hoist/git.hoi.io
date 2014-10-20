'use strict';
var http = require('http');
var pushover = require('pushover');
var config = require('config');
var repos = pushover(config.get('Hoist.git.repositories'));
var GitActionListener = require('./git_action_listener');
var BBPromise = require('bluebird');
var mongoose = BBPromise.promisifyAll(require('hoist-model')._mongoose);


module.exports = {
  createServer: function () {
    var listener = new GitActionListener();
    listener.bindToRepository(repos);
    return BBPromise.promisifyAll(http.createServer(function (req, res) {
      repos.handle(req, res);
    }));
  },
  start: function (done) {
    return BBPromise.try(function () {
        var connected = false;
        if (mongoose.connection && mongoose.connection.readyState > 0) {
          connected = true;
        }
        return connected;
      })
      .bind(this)
      .then(function (connected) {
        if (!connected) {
          return mongoose.connectAsync(config.get('Hoist.mongo.db'));
        } else {
          return null;
        }
      }).then(function () {
        /* istanbul ignore if */
        if (this._server) {
          return BBPromise.resolve(null);
        }
        this._server = this.createServer();
        return this._server.listenAsync(config.get('Hoist.http.port'));
      }).then(function () {
        console.log('listening for git actions');
      }).nodeify(done);
  },
  stop: function (done) {
    return BBPromise.try(function () {
      var connected = false;
      /* istanbul ignore else */
      if (mongoose.connection && mongoose.connection.readyState > 0 && mongoose.connection.readyState < 3) {
        connected = true;
      }
      return connected;
    }).bind(this).then(function (connected) {
      /* istanbul ignore else */
      if (connected) {
        return mongoose.disconnectAsync();
      }
    }).then(function () {
      /* istanbul ignore if */
      if (!this._server) {
        return BBPromise.resolve(null);
      }
      return this._server.closeAsync();
    }).then(function () {
      delete this._server;
    }).nodeify(done);
  }
};
