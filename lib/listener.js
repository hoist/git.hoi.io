'use strict';
var http = require('http');
var pushover = require('pushover');
var repos = pushover('/tmp/repos');
var path = require('path');
var fs = require('fs');
var hookFile = path.resolve(__dirname,'./hook.js');

var kue = require('kue');
var jobs = kue.createQueue();

jobs.process('GitPush',5,function(job,done){
  var x = 0;
  var interval = setInterval(function(){
    if(x<5){
      x++;
      console.log('internal loop');
      job.log('this is internally a loop log');
    }
    else{
      console.log('finishing');
      clearInterval(interval);
      done();
    }
  },1000);

});

repos.on('push', function (push) {
  var next = function (err) {
    console.log(err);
    if (err) {
      push.reject(500,err.message);
    } else {
      push.accept();
    }
  };
  var postReceiveHookFile = path.resolve(push.cwd, './hooks/post-receive');
  fs.lstat(postReceiveHookFile, function (err, s) {
    if (err && err.code === 'ENOENT') {
      fs.symlink(hookFile, postReceiveHookFile, next);
    } else if (err) {
      next(err);
    } else if (s.isSymbolicLink()) {
      next();
    } else {
      next('hook file already exists: ' + postReceiveHookFile);
    }
  });

});
repos.on('info', function (info) {
  info.accept();
});

repos.on('head', function (head) {

  console.log('head');
  head.write('this is a response');
  head.accept();
});

var server = http.createServer(function (req, res) {
  repos.handle(req, res);
});
server.listen(7000, function (err) {
  if (err) {
    throw err;
  }
  console.log('listening');
});
