'use strict';
import http from 'http';
import pushover from 'pushover';
import config from 'config';
var repos = pushover(config.get('Hoist.filePaths.repositories'), {
  autoCreate: true
});
import GitActionListener from './git_action_listener';
import BBPromise from 'bluebird';
import {
  _mongoose as mongoose
} from '@hoist/model';
BBPromise.promisifyAll(mongoose);
import logger from '@hoist/logger';

repos.on('error', function (err) {
  console.warn(err);
});

export default {
  createServer: function () {
    var listener = new GitActionListener();
    listener.bindToRepository(repos);
    return BBPromise.promisifyAll(http.createServer(function (req, res) {
      logger.info("got a git request");
      if (!req.headers || !req.headers.authorization) {
        logger.warn("no auth header present");
        res.setHeader("WWW-Authenticate", 'Basic');
        res.writeHead(401);
        res.end("invalid username or password");
      } else {
        logger.info('sending to handler');
        repos.handle(req, res);
      }
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
          return mongoose.connectAsync(config.get('Hoist.mongo.core.connectionString'));
        } else {
          return null;
        }
      }).then(function () {
        /* istanbul ignore if */
        if (this._server) {
          return BBPromise.resolve(null);
        }
        this._server = this.createServer();
        return this._server.listenAsync(config.get('Hoist.server.port'), config.get('Hoist.server.host'));
      }).then(function () {
        logger.info('listening for git actions on port, ' + config.get('Hoist.server.port'));
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
