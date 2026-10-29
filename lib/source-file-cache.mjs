import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireThat} from './store.mjs';

async function boundedFile(path,max){
 let file;
 try{
  file=await open(path,'r');const info=await file.stat();
  requireThat(info.isFile()&&info.size<=max,'书源副本暂不可用，请稍后再试',503);
  const bytes=Buffer.alloc(info.size+1);let size=0;
  while(size<bytes.length){const read=await file.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
  requireThat(size===info.size,'书源副本暂不可用，请稍后再试',503);
  return bytes.subarray(0,size);
 }catch(e){if(e.code==='ENOENT')return null;throw e;}finally{await file?.close();}
}

// Deployment prepares unmodified, redistribution-permitted publications. This
// directory is outside the web root; requests cannot name paths or write files.
export async function cachedSourceFile(directory,book){
 if(!directory)return null;
 requireThat(/^oa:[a-z0-9-]{1,80}$/.test(book.id),'书目编号不正确');
 const raw=await boundedFile(join(directory,'manifest.json'),32*1024);if(!raw)return null;
 let manifest;try{manifest=JSON.parse(raw);}catch{requireThat(false,'书源副本目录暂不可用',503);}
 requireThat(manifest?.version===1&&Array.isArray(manifest.books),'书源副本目录暂不可用',503);
 const entry=manifest.books.find(b=>b?.id===book.id);if(!entry)return null;
 requireThat(entry.url===book.downloadUrl&&/^[a-f0-9]{64}$/.test(entry.sha256)&&Number.isInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=10*1024*1024,'书源副本校验未通过',503);
 const bytes=await boundedFile(join(directory,book.id.slice(3)+'.bin'),10*1024*1024);if(!bytes)return null;
 requireThat(bytes.length===entry.bytes&&createHash('sha256').update(bytes).digest('hex')===entry.sha256,'书源副本校验未通过',503);
 return bytes;
}
