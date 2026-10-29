import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {Fault,requireThat} from './store.mjs';

export const wikiUrl=title=>'https://zh.wikisource.org/wiki/'+encodeURIComponent(title);
// Ship a title snapshot: the production network reaches WS Export, but not
// the wiki API. Searching must remain fast even when a source is unavailable.
const catalog=JSON.parse(readFileSync(new URL('./wikisource-catalog.json',import.meta.url),'utf8'));
export function searchWikisource(term,fold=s=>s.toLowerCase()){
  const q=fold(term.trim());if(!q)return [];
  return catalog.books.filter(p=>fold(p.title+' '+p.aliases).includes(q)).sort((a,b)=>a.title.length-b.title.length).slice(0,20)
    .map(p=>({id:'ws:'+p.id,title:p.title,author:p.author||'',language:'中文',provider:'维基文库',format:'EPUB 正文',source_url:wikiUrl(p.title)}));
}
export function wikiBook(sourceId){
  const match=/^ws:([1-9]\d{0,9})$/.exec(sourceId);requireThat(match,'请从搜索结果选择一本书',400);
  const page=catalog.books.find(p=>p.id===Number(match[1]));requireThat(page,'请从搜索结果选择一本书',404);
  return {title:page.title,url:wikiUrl(page.title),exportUrl:'https://ws-export.wmcloud.org/?'+new URLSearchParams({lang:'zh',format:'epub',page:page.exportTitle})};
}
export function parseSourceEpub(bytes,{timeout=15000,wikisource=true,sourceArchive=false}={}){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./ebook-source-worker.mjs',import.meta.url),{workerData:{bytes,wikisource,sourceArchive},execArgv:process.execArgv.filter(a=>!a.startsWith('--input-type')),resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:8}});
    const timer=setTimeout(()=>finish(new Fault('这本书整理得有点久，请换个版本试试',422)),timeout);
    let settled=false;
    function finish(error,book){if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(book);}
    worker.once('message',m=>m.error?finish(new Fault('这本书暂时没能整理好：'+m.error,422)):finish(null,m.book));
    worker.once('error',()=>finish(new Fault('这本书整理失败，请稍后再试',422)));
    worker.once('exit',()=>{if(!settled)finish(new Fault('这本书整理中断，请稍后再试',422));});
  });
}
