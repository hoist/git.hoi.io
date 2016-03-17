'use strict';
var gulp = require('gulp');
var del = require('del');

gulp.task('clean-coverage', function () {

  del('coverage/**/*');
});
gulp.task('clean-docs', function () {
  del('docs/**/*');
});
