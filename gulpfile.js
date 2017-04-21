var gulp = require('gulp');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');

gulp.task('js-hint', function () {
  return gulp.src('index.js')
    .pipe(jshint({
        'esversion': 6
    }))
    .pipe(jshint.reporter(stylish));
});

gulp.task('default', ['js-hint']);
