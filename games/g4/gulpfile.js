const gulp = require("gulp");
const babel = require("gulp-babel");
const zip = require("gulp-zip");
const size = require("gulp-size");
const sourcemaps = require("gulp-sourcemaps");
const concat = require("gulp-concat");
const add = require("gulp-add");
const uglify = require('gulp-uglify');
const terser = require('gulp-terser');
const imagemin = require('gulp-imagemin');
const cleancss = require('gulp-clean-css');
const htmlmin = require('gulp-htmlmin');
const shell = require('gulp-shell');
const eslint = require('gulp-eslint');

const levelPacker = require("./level-packer");

gulp.task('build:html', () => {
    gulp.src('src/*.html')
        .pipe(htmlmin())
        .pipe(gulp.dest('raven'));
});

gulp.task('build:css', () => {
    gulp.src('src/css/*.css')
        .pipe(cleancss())
        .pipe(gulp.dest('raven'));
});

gulp.task('build:assets', () => {
    // Assets starting with _ (underscore) don't need to be included in the build.
    // (These are PNG files I'm using in my Tiled tileset, just for ease of editing.)
    gulp.src(['src/assets/*.png', '!src/assets/_*.png'])
        .pipe(imagemin())
        .pipe(gulp.dest('raven/assets'));
});

gulp.task('build:js', () => {
    let compatMode = false;
    let debugMode = false;
    let build = gulp.src('src/js/*.js')
        .pipe(add("LevelCache.js", levelPacker.packAll("src/levels/level*.json"), true))
        .pipe(sourcemaps.init())
        .pipe(concat('app.js'))
        .pipe(size());

    if (debugMode) {
        // do nothing; best stack traces for tricky bugs
        // (yes, we have source maps, but my overly-aggressive mangling strategy
        // fubars the sourcemap)

        // I only turn these on for special occasions - for this game, I really didn't bother
        // with linting, and I ignore all the feedback that wouldn't save me space. (Basically,
        // the only things I'm interested in are unused var, prefer destructuring, and prefer
        // simple property notation, anything else is going to be smashed up by terser anyway.)
        //
        build = build
            .pipe(eslint())
            .pipe(eslint.format());
    } else if (compatMode) {
        // To generate ES5 code, for more compatibility, use babel+uglify
        build = build
            .pipe(babel())
            .pipe(uglify({ toplevel: true }));
    } else {
        // For smaller ES6 code, use terser
        build = build
            .pipe(terser({
                toplevel: true,
                mangle: {
                    properties: {
                        // Properties beginning with "_" are private methods, which on each class
                        // I've specified to indicate they aren't called by other objects, and can
                        // be safely squished.
                        //
                        // Some key methods on Util are used a lot, so calling them out explicitly
                        // lets us get some extra squishiness. (Actually, ideally we'd just squish
                        // everything on Util, but I don't see a good way to do that.)
                        regex: /^_|^wallAt|^tileAt|^doorAt|^pointIn|^getVisCone|^getVisBounds|^enforceEntityMovement|^renderTogglePrompt|^entitySpotted|^pointSpotted|^drawSprite|^distance|^getFontString/
                    }
                }
            }));
    }

    build = build
        .pipe(size())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('raven'));
});

gulp.task('build', ['build:html', 'build:css', 'build:assets', 'build:js']);

// These two tasks require the advpng and advzip tools which you can download and
// build from http://www.advancemame.it/download (from js13k resources page).
gulp.task('zip:pre', shell.task('../advpng -z -4 raven/assets/*.png'));
gulp.task('zip:post', shell.task('../advzip -z -4 zip/js13k-2018-raven.zip'));

gulp.task('zip', () => {
    gulp.src(['raven/**', '!raven/app.js.map'], { base: '.' })
        .pipe(zip('js13k-2018-raven.zip'))
        .pipe(size())
        .pipe(gulp.dest('zip'));
});

gulp.task('watch', () => {
    gulp.watch('src/*.html', ['build:html']);
    gulp.watch('src/css/*.css', ['build:css']);
    gulp.watch('src/assets/*', ['build:assets']);

    gulp.watch('src/js/*.js', ['build:js']);
    gulp.watch('src/levels/*', ['build:js']);
    gulp.watch('*.js', ['build:js']);
});

gulp.task('default', ['build', 'watch']);
