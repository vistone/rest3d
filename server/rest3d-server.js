
/*

rest3d-server.js

The MIT License (MIT)

Copyright (c) 2013 Rémi Arnaud - Advanced Micro Devices, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

'use strict';

if (process.env['NODETIME_KEY']) {
	console.log("+=+=+= Starting http://nodetime.com");
	console.log("Key = '"+process.env['NODETIME_KEY']+"'");
	require('nodetime').profile({
    accountKey: process.env['NODETIME_KEY'], 
    appName: 'rest3d.fl4re.com node server'
  });
}

var restify = require('restify');
//var connect = require('connect');
var http = require('http');
var utils = require('./src/utils');
var childProcess = require('child_process');
var os= require('os');
require('shelljs/global');

var fs = require('fs');
var path = require('path');
var cache = require('./src/diskcache').Cache;
// fast html scrapping
var request = require('request');
// get content from zip files
var zip = require("zip");

var formidable = require('formidable');

var rmdirSync = require('./src/rmdir');
var copyFileSync = require('./src/cp');

var toJSON = require('./src/tojson');

var FileInfo = require('./src/fileinfo');
var sendFile = require('./src/sendfile');
var handler= require('./src/handler');

var platform = os.type().match(/^Win/) ? 'win' : 
				(os.type().match(/^Dar/) ? 'mac' : 'unix');

console.log('host platform=',platform);
var staticPath = path.join(__dirname , '../static');

console.log('static folder=',staticPath);

var listenToPort = process.env.OPENSHIFT_NODEJS_PORT || 
                   process.env.PORT || 
                   8000;
var ip_address = process.env.OPENSHIFT_NODEJS_IP || null;


// see where collada2gltf is located
var openshift = process.env.OPENSHIFT_DATA_DIR;
var collada2gltf = 'collada2gltf';
if (openshift) 
    collada2gltf = openshift + 'bin/collada2gltf-latest';
if (process.env.GLTF_BIN_PATH)
    collada2gltf = process.env.GLTF_BIN_PATH+'/collada2gltf';

var server = module.exports.server = restify.createServer();


rmdirSync('tmp');
rmdirSync('cache');
rmdirSync('upload');

fs.mkdirSync('tmp');
fs.mkdirSync('upload');
fs.mkdirSync('cache');

fs.chmodSync('tmp', '777');
fs.chmodSync('upload', '777');
fs.chmodSync('cache', '777');

//fs.mkdirSync('upload/thumbnail');

server.use(restify.acceptParser(server.acceptable));
//server.use(restify.authorizationParser());
server.use(restify.dateParser());
server.use(restify.queryParser());
//server.use(restify.bodyParser()); -> use formidable instead
server.use(restify.gzipResponse());
restify.defaultResponseHeaders = false;

var session=require('./src/session')();
server.sessionManager = session;
server.use(session.sessionManager);

// include routes
require('./src/warehouse')(server);
require('./src/3dvia')(server);
require('./src/upload')(server);

require('./src/basex')(server);

// create diskcache (no mem caching, no gzip)
server.diskcache = new cache('cache',true,false,false); 

function unknownMethodHandler(req, res) {
	console.log('unkownMethodHandler method='+req.method.toLowerCase());
  if (req.method.toLowerCase() === 'options') {
    var allowHeaders = ['Accept', 'Accept-Version', 'Content-Type', 'Api-Version'];

    if (res.methods.indexOf('OPTIONS') === -1) res.methods.push('OPTIONS');

    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
    res.header('Access-Control-Allow-Methods', res.methods.join(', '));
    res.header('Access-Control-Allow-Origin', req.headers.origin);

    return res.send(204);
  }
  else
    return res.send(new restify.MethodNotAllowedError());
}

server.on('MethodNotAllowed', unknownMethodHandler);
/*
server.use(restify.throttle({
  burst: 100,
  rate: 50,
  ip: true,
  overrides: {
    '192.168.1.1': {
      rate: 0,        // unlimited
      burst: 0
    }
  }
}));
*/
//server.use(restify.conditionalRequest());


// rest3d API


// convert

server.post(/^\/rest3d\/convert.*/,function(req,res,next){
	 console.log('post -> convert');

	 var form = new formidable.IncomingForm(),
         url = '',
         params = {};

   var h = new handler(req,res, next);
         

     form.on('field', function (name, data) {
     	params[name] = data;
     }).on('error', function (e) {
     	h.handleError(e);
     }).on('end', function(){//
     	console.log('now converting collada');
     	console.log(params);
     	 	console.log(params.uri);
     	// if (!params.name && !params.uri || !params.name.toLowerCase().endsWith('dae')) { 
     	// 	h.handleError({error: 'invalid file '+params.name+' in convert'});
     	// 	return;
     	// }
     	if(params.hasOwnProperty("uri")){
     		var output_dir = params.uri.split('/')[1]+'_gltf';
     		console.log(output_dir);
	     	var output_file = params.uri.split('/').pop().replace('.dae','.json');
	     	console.log(output_file);
	     	fs.mkdirSync('upload/'+output_dir);
	     	var cmd = collada2gltf+" -p -f \"upload" + params.uri+"\" -o \""+'upload/'+output_dir+'/'+output_file+"\"";
	     	console.log(collada2gltf+" -p -f \"upload" + params.uri+"\" -o \""+'upload/'+output_dir+'/'+output_file+"\"");
     	}
     	else{
	     	var output_dir = params.name.split('\.')[0]+'_gltf';
	     	var output_file = params.name.replace('.dae','.json');
	     	fs.mkdirSync('upload/'+output_dir);

	     	var cmd = collada2gltf+" -p -f \"upload/" + params.name+"\" -o \""+'upload/'+output_dir+'/'+output_file+"\"";
     }
     	console.log('exec '+cmd);
     	// todo -> manage progress !!!
		var outputC2J;
     	var codeC2J;
     	// todo -> manage progress !!!
		var ls = childProcess.exec(cmd, function (error, stdout, stderr) {
		   if (error) {
		     console.log(error.stack);
		     //console.log('Error code: '+error.code);
		     //console.log('Signal received: '+error.signal);

			 h.handleError({"code":error.code, "message": stderr});

		   }
		   console.log('Child Process STDOUT: '+stdout);
		   console.log('Child Process STDERR: '+stderr);
		 });

		 ls.on('exit', function (code, output) {
		  console.log('Child process exited with exit code '+code);
		  if (code !== 0) {
				h.handleError({errorCode:code, message:'Child process exited with exit code '});
				return;
			}
			codeC2J= code;
			outputC2J = output;
			console.log('Exit code:', code);
	  		console.log('Program output:', output);
					
			// hack, copy all images in the output_dir, so the viewer will work
		    fs.readdir('upload/', function (err, list) {
                list.forEach(function (name) {
                	if (name.endsWith('.png'))
                	{
                		copyFileSync('upload/'+name,'upload/'+output_dir+'/'+name);
                		console.log('upload/'+name+'  TO  upload/'+output_dir+'/'+name);
                	}
		        });
		    });
		    // end hack

			var files = [];
			fs.readdir('upload/'+output_dir, function (err, list) {
                list.forEach(function (name) {
		            var stats = fs.statSync('upload/'+output_dir + '/' + name),
		                fileInfo;
		            if (stats.isFile() && name[0] !== '.') {
		                fileInfo = new FileInfo({
		                    name: output_dir+'/'+name,
		                    size: stats.size
		                });
		                //fileInfo.initUrls(req);
		                files.push(fileInfo);
		            }
		        });
		        var timeout = function() {
                    	rmdirSync('upload/'+output_dir);
                    	console.log('timeout !! upload/'+output_dir+'/ was deleted');
                    }
                    setTimeout(function() { timeout()},5 * 60 * 1000);
		        h.handleResult({files: files, code:codeC2J, output:outputC2J});
		    });		
	     });
	     });

    form.parse(req);

});

// static server
server.get(/^\/.*/, function (req, res, next) {
	
	// parse out parameters from url
	var filename = req.url.split('\?')[0];
	var p=path.resolve(staticPath + filename);

	console.log('http get path='+filename);

	sendFile(req,res,p);
	return next();
});

// clean exit
function sigterm_handler() {
    console.warn('Kaboom Baby!');
    process.exit(0);
}

process.on('SIGTERM', sigterm_handler);

// run server
server.listen( listenToPort, ip_address);
console.log ('rest3d server running on port '+listenToPort);




