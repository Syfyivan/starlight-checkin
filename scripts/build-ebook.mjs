import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
await build({entryPoints:['lib/ebook/parse.mjs'],bundle:true,format:'iife',globalName:'StarlightEbooks',platform:'browser',target:['chrome80','safari14'],supported:{destructuring:true},outfile:'public/vendor/ebook-parser.js',minify:true,legalComments:'eof'});
const file='public/vendor/ebook-parser.js',bundle=readFileSync(file,'utf8'),at=bundle.indexOf('/*! Bundled license information:');
if(at>=0)writeFileSync(file,bundle.slice(0,at)+bundle.slice(at).replace(/[ \t]+$/gm,''));
