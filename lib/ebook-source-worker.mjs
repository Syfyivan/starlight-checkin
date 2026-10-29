// Reuse the vetted browser bundle; no runtime npm installation is required.
import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Promise,setTimeout,clearTimeout,setImmediate};
try{
  vm.runInNewContext(readFileSync(new URL('../public/vendor/ebook-parser.js',import.meta.url),'utf8'),context);
  const book=await context.StarlightEbooks.parseEpub(workerData.bytes,{wikisource:workerData.wikisource!==false,sourceArchive:workerData.sourceArchive===true});
  parentPort.postMessage({book});
}catch(e){parentPort.postMessage({error:e.message});}
