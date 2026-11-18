import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

// The public share exposes filenames, not the language of the book body.
export function isSimplifiedEdition(name){
  const label=name.normalize('NFKC').toLowerCase().replace(/簡/g,'简').replace(/體/g,'体');
  if (/繁体|正体|正體|简繁|繁简|雙語|双语|对照|對照|traditional[\s_-]*chinese|zh[-_]hant/i.test(label)) return false;
  return /(?:^|[\s_()【】\[\]])(?:(?:中文)?简体(?:中文)?(?:版|字版)?|zh[-_]hans|simplified[\s_-]+chinese)(?=$|[\s_.）)】\]])/i.test(label);
}

const publicShare=/^https:\/\/pan\.quark\.cn\/s\/[a-z0-9]+$/i;

export function loadQuarkIndex(path, fold) {
  if (!path) return [];
  let bytes;
  try { bytes = readFileSync(path); }
  catch (err) { if (err.code==='ENOENT') return []; throw err; }
  const {share,files} = JSON.parse(gunzipSync(bytes,{maxOutputLength:2*1024*1024}));
  if (!publicShare.test(share)) throw new Error('夸克书目分享地址无效');
  return files.filter(([name])=>isSimplifiedEdition(name)).map(([name,folder,size,note,parentId,singleUrl])=>{
    const ext = name.split('.').pop().toLowerCase();
    const limit = {epub:10,mobi:10,txt:2}[ext];
    if (!limit || !(size>0 && size<=limit*1024*1024)) throw new Error('夸克书目格式或大小无效');
    const folderLink=typeof parentId==='string' && /^[a-f0-9]{32}$/i.test(parentId);
    const fileLink=typeof singleUrl==='string' && singleUrl!==share && publicShare.test(singleUrl);
    const folderUrl=folderLink ? share+'#/list/share/'+parentId : share;
    const url=fileLink ? singleUrl : folderUrl;
    return {key:fold(name.slice(0,-ext.length-1)),file:{name,folder,size,note,format:ext.toUpperCase(),url,folderLink,fileLink}};
  });
}

export function searchQuark(index, key) {
  return index.filter(entry=>entry.key.includes(key))
    .sort((a,b)=>Number(b.key===key)-Number(a.key===key) || a.file.size-b.file.size)
    .slice(0,12).map(entry=>entry.file);
}
