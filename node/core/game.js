var Scope     = require('../models/scope'),
    S2        = require('../dvastula/compiler'),
    Element   = require('../models/element'),
    api       = require('./api'),
    config    = require('../config/config');

var fs    = require('fs'),
    R     = require('ramda'),
    join  = require('path').join,
    mkdirp = require('mkdirp'),
    beautify = require('js-beautify');

var apiFunction = function(method){
  return api[method];
};

function Game(o){
  this.fps = 60 / 28;
  this.inited = false;
  this.elements = [];
  this.api = api;
  this.scope = new Scope({
    width     : o.width,
    height    : o.height,
    elements  : this.elements,
    api       : apiFunction
  });
}

Game.prototype.start = function(data){
  var self = this;

  var code = data.code;
  var js = S2(code);
  var pathName = join(config.files, data.uid.toString());
  var fileName = [data.instance, data.time , 'js'].join('.');
  var filePathName = join(pathName, fileName);

  mkdirp(pathName, function(err) {
    if(err){
      console.trace();
      throw err;
    }

    console.log('Writing file:', pathName,  fileName);
    fs.writeFile(filePathName, beautify(js, {indent_size : 2}), function(err, data){
      //
      var fn = require(filePathName);
      fn(self.scope); // <- лол, точка входа в скомпелдированный код
      console.log('#### GLOBAL SCOPE ####');
      console.log(self.scope.store);
      console.log('#### LOCAL SCOPE OF ID=0 ####');
      console.log(self.scope.store.elements[0].scope.store);
    });

  });

  data.elements.forEach(this.addElement.bind(this));

  if(this.inited){
    return ;
  }else{
    setInterval(this.update.bind(this), this.fps);
    this.inited = true;
  }
};

Game.prototype.update = function(callback){
  this.elements = this.elements.map(function(elem, i){
    return elem.invoke();
  });

  if(this.onFrameEnd) {
    this.onFrameEnd.call(null, this.takeSnapshot());
  }
};

Game.prototype.takeSnapshot = function(){
  return this.elements.map(function(elem){
    return {
      id : elem.id,
      x  : elem.x,
      y  : elem.y
    };
  });
};

Game.prototype.addElement = function(el){
  var element = new Element(el, this.scope.store);

  // TODO добавить проверку на уникальность

  this.elements.push(element);
};

module.exports = Game;