'use strict';
/* jshint multistr:true */
var path = require('path');
var configPath = path.resolve(__filename, '../../', 'config');

process.env.MUTE_LOGS = true;
process.env.NODE_CONFIG_DIR = configPath;

var logger = require('@hoist/logger');
var Deployer = require('./deployer');
var streamToPromise = require('stream-to-promise');

logger.info('starting deployment');
streamToPromise(process.stdin)
  .then(function (input) {
    logger.info('creating deployer');
    return new Deployer(input);
  }).then(function (deployer) {
    logger.info('starting deploy');
    return deployer.deploy();
  }).catch(function (err) {
    logger.error(err);
    console.log(err.message);
    process.exit(1);
  }).finally(function () {
    logger.info('done');
    process.exit(0);
  });
