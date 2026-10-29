import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
await build({entryPoints:['lib/ebook/parse.mjs'],bundle:true,format:'iife',globalName:'StarlightEbooks',platform:'browser',target:['chrome80','safari14'],supported:{destructuring:true},outfile:'public/vendor/ebook-parser.js',minify:true,legalComments:'eof'});
const file='public/vendor/ebook-parser.js',bundle=readFileSync(file,'utf8'),at=bundle.indexOf('/*! Bundled license information:');
if(at>=0)writeFileSync(file,bundle.slice(0,at)+bundle.slice(at).replace(/[ \t]+$/gm,''));
await build({entryPoints:['lib/ebook/display.mjs'],bundle:true,format:'esm',platform:'browser',target:['chrome80','safari14'],supported:{destructuring:true},outfile:'public/vendor/book-display.js',minify:true,legalComments:'eof'});
writeFileSync('public/vendor/OPENCC-LICENSES.txt','opencc-js 1.4.2; https://github.com/nk2028/opencc-js\nCode and bundled dictionary notices:\n\n'+readFileSync('node_modules/opencc-js/LICENSE','utf8')+'\n'+readFileSync('node_modules/opencc-js/THIRD_PARTY_LICENSES.md','utf8'));
