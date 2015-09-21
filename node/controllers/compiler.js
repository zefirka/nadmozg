var extend = require('../../common/utils').Utils.extend;

var common = require('./common');

var config   = require('../config/config.js'),
    path     = require('.path').join,
    lib = path(config.static, 'lib'),
    jsc = path(config.static, 'js');

common.scripts.push(path(jsc, 'compiler.js'));
common.scripts.push(path(lib, 'jshighlight/highlight.pack.js'));
common.styles.push(path(lib, 'jshighlight/github.css'));

module.exports = extend({}, common, {
  route : 'compiler'
});
