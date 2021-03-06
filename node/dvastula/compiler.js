/**
  Модуль реализующий комплияцию кода на 2stula в JavaScript
  @requires {@link module:ss2/errors}
  @requires module:ss2/utils
  @requires module:ss2/parser
  @requires module:common/utils
  @module ss2/compiler
*/

var Errors  = require('./maps/errors'),
    Parser  = require('./s2.js');

var utils       = require('../../common/utils'),
    toArray     = utils.toArray,
    interpolate = utils.interpolate,
    is          = utils.is;

var compilerUtils   = require('./maps/utils'),
    strarr          = compilerUtils.strarr,
    call            = compilerUtils.call,
    returnLastValue = compilerUtils.returnLastValue,
    commentCode     = compilerUtils.comment;

/**
 * Короткий алиас, позволяющий определять функции для компилятора
 * Если arity == null, то функция может принимать разное количество аргументов
 * @static
 * @param {number} arity
 * @param {function} fn
 * @return {object}
 */
function define(arity, fn){
  return {
    arity : arity,
    fn : fn
  };
}


/**
 * Если list - массив массивов, то компилирует каждый элемент как отдельный список
 * Иначе компилирует как выражение SS2
 * @static
 * @param {array} list - ss2 code
 * @return {string} js code
 */
function compileWithLastValue(list){
  return returnLastValue(list, compile);
}

/**
  Language reference
  Здесь описывается сами директивы языка
  @namespace SS2
*/
var API = {};

/**
 * @param {object} o - алиасы в виде исходное значение : алаис
 * @memberof SS2
 */
API.makeAliases = function(o){
  for(var i in o){
    this[o[i]] = this[i];
  }
};

/**
 * Вычисляет value и в засовыывает в стор соответствующее значение
 * @name def
 * @function
 * @access public
 * @param {symbol} name
 * @param {mixed} value
 * @memberof SS2
 */
API.def = define(2, function(name, value){
  // добавляем сначала комментарий кода, чтобы не запутаться и для того, чтобы можно было потом сорс-мап написать
  var debug = commentCode('[def {{0}} {{1}}]', name, strarr(value));

  // если следующая директива - определение функции, то храним это значение в приватных данных lang
  if(value[0] == 'lambda'){
    lang.set('private', name, 'function');
  }

  // компилируем значение
  value = compile(value);

  /* При попытке переписать зарезервированный идентификатор бросаем эксепшн. */
  if (lang.derefReserved[name]){
    return interpolate('this.throwError("Trying to rewrite reserved word {{0}}");', name);
  }

  lang.set('public', name, 'this.store.get("' + name + '")');

  return debug + interpolate('this.store.set("{{name}}", {{value}})', {
    name : name,
    value : value
  });
});


/**
 * Компилирует в логгер
 * @name log
 * @function
 * @access public
 * @param {mixed} argument
 * @return {string}
 * @memberof SS2
 */
API.log = define(null, function(/* ... */){
  var args = toArray(arguments).map(compile);
  return '(function(){console.log.call(console, ' + args + ');}).call(this)';
});


/**
 * Вычисляет value и в засовыывает в текущий скоупg
 * @name let
 * @function
 * @access public
 * @param {symbol} name
 * @param {mixed} value
 * @memberof SS2
 */
API.let = define(null, function(name, value){
  var debug = commentCode('[let {{0}} {{1}}]', name, strarr(value));

  value = compile(value);

  /* При попытке переписать зарезервированный идентификатор бросаем эксепшн. */
  if (lang.derefReserved[name]){
    return interpolate('this.throwError("Trying to rewrite reserved word {{0}}");', name);
  }

  var cname = utils.camelCase(name);

  lang.set('private', name, cname );

  return debug + 'var ' + cname + ' = ' + value + ';' + toArray(arguments).slice(2).map(compile);
});

/**
 * Возвращает целое число в диапазоне от from до to
 * @function
 * @name rand-int
 * @param {number} from
 * @param {number} to
 * @memberof SS2
 */
API['rand-int'] = define([1,2], function (from, to){
  var debug = commentCode('[rand-int {{0}} {{1}}]', strarr(from), strarr(to));

  if(!to){
    to = from;
    from = 1;
  }

  from = compile(String(from));
  to = compile(String(to));

  return debug + '(' + from + ' + ( Math.random() * (' + to +' - ' + from + ') >> 0 ) )';
});

/**
 * Генерирует лямбдя-функцию
 * @function
 * @name lambda
 * @param {symbols} params
 * @param {ast} body
 * @memberof SS2
 */
API.lambda = define(2, function(params, body){
  var debug = commentCode('[lambda {{0}} {{1}}]', strarr(params), strarr(body));

  params = params.join(',');


  if(Array.isArray(body[0])){
    body = body.map(compile).join('\n');
  }else{
    // null null нужны
    // хз зачем
    body = compile(body, null, null);
  }

  lines = body.split('\n');
  lines[lines.length - 1] =  'return ' + lines[lines.length - 1];
  body = lines.join('\n');

  return debug + interpolate('(function({{params}}){\n\t {{body}} \n\t})', {
    params : params,
    body : body
  });
});



API.idle = define(0, function(){
  var debug = commentCode('[idle]');

  return debug + call('this.phase = null');
});

/**
 @name defn
 */
API.defn = define(3, function(name, params, body){
  var debug = commentCode('[defn {{0}} {{1}} {{2}}]', name, strarr(params), strarr(body));

  lang.set('public', name, function(){
    var myParams = strarr(toArray(arguments));
    return 'this.store.get("' + name + '")(' + myParams + ')';
  });

  return debug + API.def.fn.call(this, name, ['lambda', params, body]);
});

/**
 @name if
 */
API['if'] = define([2,3], function(cond, then, _else){
  var debug = commentCode('[if {{0}} {{1}} {{2}}]', strarr(cond), strarr(then), _else ? strarr(_else) : '');

  var ar2Statement = 'if ({{condition}}) { {{then}}}',
      ar3Statement = ar2Statement + ' else { {{_else}} }',
      str = ar2Statement;

  if (arguments.length == 3){
    str = ar3Statement;
  }

  if(Array.isArray(then[0])){
    then = compileWithLastValue(then);
  }else{
    then = 'return (' + compile(then) + ')';
  }

  if(_else && Array.isArray(_else[0])){
    _else = compileWithLastValue(_else);
  }else{
    _else = 'return (' + compile(_else) + ')';
  }


  var res = interpolate(str, {
    condition : compile(cond),
    then : then,
    _else : _else
  });

  return debug + '(function(){ ' + res + ' }).call(this)';
});

/**
 @name cond
 */
API.cond = define(null, function(cond){
  var debug = CUtils.comment('[cond {{0}} {{1}} {{2}}]', strarr(cond), strarr(arguments[1]));
  var actions = [];
  for(var i = 1; i < arguments.length; i++) {
    actions.push(compile(arguments[i]));
  }
  var then = actions.join(';\n');
  var ar2Statement = 'if ({{condition}}) { {{then}}; return true; }',
      str = ar2Statement;

  var res = interpolate(str, {
    condition : compile(cond),
    then : compile(then)
  });

  return res;
});

API.list = define(null, function(){
  return '[' + toArray(arguments).map(compile).join(', ') + ']';
});

/* MATH MACHT FREI */
(['+', '-', '*', '/', '>', '<', '>=', '<=', '&&', '&', '>>', '<<', '||']).forEach(function(op){
  API[op] = {
    fn : function(){
      var args = toArray(arguments).map(compile).join(', ');
      var debug = commentCode('[' + op + ' ' +  strarr(args) + ']');
      return debug + '(function(){ return Array.prototype.slice.call(arguments).reduce(function(a, b){ return a ' +
        op + ' b;}) }).call(null, ' + args +  ')';
    }
  };
});

API.makeAliases({
  '&&' : 'and',
  '||' : 'or',
  '>'  : 'gt',
  '<'  : 'lt',
  '>=' : 'gte',
  '<=' : 'lte'
});

API.last = define(1, function(lst){
  var l = compile(['length', lst]);
  var coll = compile(lst);
  return coll + '[' + l +' - 1]';
});

API.range = define(null, function(from, to){
  var t = '[{{0}}]';
  var j = '';

  if(!to){
    to = from;
    from = 0;
  }

  while(to - from >= 0){
    j += from + ', ';
    from++;
  }
  return compile(interpolate(t, j));
});

API.hash = define(null, function(){
  var args = toArray(arguments);
  var res = '';
  for(var i = 0, l = args.length; i < l; i += 2){
    var name = args[i],
        value = compile(args[i + 1]);

    res += '"' + name + '" : ' + value + ' ,';
  }

  res.slice(0, -1);

  return '{ ' + res + ' }';
});

API.eq = define(2, function(a, b){
  return '(function(){ return ' + compile(a) + '==' + compile(b) + '; }).call(this)';
});

API.not = define(1, function(a){
  return '(function(){ return !( ' + compile(a) + ' ); }).call(this)';
});

API['for'] = define(2, function(name, rules){
  var debug = commentCode('[for {{0}} {{1}}]', strarr(name), strarr(rules));

  lang.context = 'e';
  var body = rules.map(compile).join(';\n');
  lang.context = 'g';

  var res = '';

  if(Array.isArray(name)){
    res  = '(' + compile(name) + ').forEach(function (name){ ' +
      '(function(){' + body + ' }).call(this.getElement(String(name)))}.bind(this))';
  }else{
    res = '(function(){' + body + ' }).call(this.getElement("' + name + '"))';
  }

  return debug + res;
});

API.nth = define(2, function(collection, n){
  var coll = compile(collection);
  return coll + '[' + compile(n) +']';
});

API.length = define(1, function(collection){
  return '(' + compile(collection) + ').length';
});

API.call = define(null, function(fn){
  var args = toArray(arguments).slice(1).map(compile).join(', ');
  return '(' + utils.camelCase(fn) + ').call(this, ' + (args || 'null') + ' )';
});

API.apply = define(2, function(fn){
  var args = compile(toArray(arguments).slice(1));
  return '(' + utils.camelCase(fn) + ').apply(this, ' + (args || 'null') + ' )';
});

API.when = define(2, function(phase, behavior){
  return 'this.when("' + phase + '", function(){' +  behavior.map(compile).join(';\n') + '})';
});

/**
 Фазы
 */
API.phase = define(null, function(name, source){
  var debug = commentCode('[phase {{0}} {{1}}]', name, source ? strarr(source) : '');
  var res = '';

  if(!source){
    if(lang.context == 'g'){
      res = 'this.throwError("You can\'t set phase on global context ")';
    }else{
      res = 'this.phase = ' + compile(name);
    }
  }else{
    lang.context = 'e';

    lang.set('public', name, '"' + name + '"');

    var phase = ' function(){' + source.map(compile).join(';\n') + '} ';
    res = 'this.phases["' + name + '"] = ' +  phase + '';
    lang.context = 'g';
  }

  return debug + res;

});

API['do'] = define(null, function(name){
  var args = toArray(arguments).slice(1).map(compile).join(', ');
  return 'this.api.call(this, "' + name + '"' + (args ? ', ' + args : '') +')';
});

/* Вот здесь происходит определение языка на основе вышеизложенного API */
var lang = require('./lang')(API);

/**
  Компилирует строку ss2 в js
  @public
  @param {string} source код ss2
  @return {string} код на js
*/
function Compiler(source){
  var translatedJs = Parser(source);
  var body = translatedJs.map(compile);

  var jsSource = body[body.length - 1];

  if (body[body.length - 1 ].slice(0, 6) !== 'return'){
    body[body.length - 1 ] = 'return ( ' + (jsSource || 'undefined') + ' )';
  }
  body = body.join('\n\n');
  var res = interpolate(compilerUtils.functionWrapper, {
    fname : 'comp',
    arg_name : 'globalEnv',
    body : body,
    context : '',
    arg_values : 'void 0'
  });

  return res;
}

// использование Math.round() даст неравномерное распределение!
function getRandomInt(min, max)
{
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function compile(js, indexInParent, parent){
  if (is.array(js)){
    var pos = 0;

    while(pos < js.length ){
      var token = js[pos];

      if (lang.derefPrivate(token)){
        token = token;
      } else {
        token = lang.derefAll(token) || token;
      }

      if (pos === 0 && !( is.fn(token)  || lang.isFn(token) )  ){
        return compilerUtils.errorWrapper;
      }

      if (pos === 0) {
        if (is.fn(token) ) {
          js = token.apply(null, js.slice(1));
        }else{
          return compilerUtils.wrapInnerCall(token, js.slice(1).map(compile));
        }
      }else{
        if (is.array(token)){
          token = token.map(compile);
          js[pos] = token;
        }
      }

      pos++;
    }

    return js;

  }else{

    if ( /^\{.+\}$/.test(js) ){
      return compilerUtils.funcForm(js);
    } else
    if (/^\$.+$/.test(js) ){
      return compilerUtils.globalForm(js);
    } else
    if (/^\@.+$/.test(js)) {
      return compilerUtils.derefForm(js);
    }else{
      if (lang.derefReserved(js)){
        js = interpolate('globalScope.throwError("Trying to rewrite reserved word {{0}}");', js);
      }else
      if (lang.derefPrivate(js)){
        js = lang.derefPrivate(js) || 'dnsoadn';
      }else{
        js = lang.derefPublic(js) || js;
      }
      return js;
    }

  }
}

module.exports = Compiler;
