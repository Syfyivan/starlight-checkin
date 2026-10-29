import {build} from 'esbuild';
await build({entryPoints:['lib/ebook/parse.mjs'],bundle:true,format:'iife',globalName:'StarlightEbooks',platform:'browser',target:['chrome80','safari14'],supported:{destructuring:true},outfile:'public/vendor/ebook-parser.js',minify:true,legalComments:'eof'});
