'use strict';
/* jshint multistr:true */
global.Promise = require('bluebird');
require("babel/register");
var path = require('path');
var configPath = path.resolve(__filename, '../../', 'config');
process.env.NODE_CONFIG_DIR = configPath;
var logger = require('@hoist/logger');
var Deployer = require('./deployer');
var _ = require('lodash');
var streamToPromise = require('stream-to-promise');
logger.streams = _.reject(logger.streams, function (stream) {
  return stream.name === 'console';
});
streamToPromise(process.stdin)
  .then(function (input) {
    return new Deployer(input);
  }).then(function (deployer) {
    return deployer.deploy();
  }).catch(function (err) {
    console.log(err.message);
    process.exit(1);
  }).finally(function () {
    process.exit(0);
  });
