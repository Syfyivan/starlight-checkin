import {readFileSync} from 'node:fs';
import {requireThat} from './store.mjs';

const catalog=JSON.parse(readFileSync(new URL('./open-books-catalog.json',import.meta.url),'utf8'));
const MAX_DOWNLOAD=10*1024*1024;
const hosts={openbookshk:['openbookshongkong.com'],digitalclassics:['www.chineseclassic.com']};
function eligible(book){
 if(!book||!/^oa:[a-z0-9-]{1,80}$/.test(book.id)||book.language!=='中文'||book.format!=='epub'||!book.complete)return false;
 if(!Number.isInteger(book.bytes)||book.bytes<1||book.bytes>MAX_DOWNLOAD||!book.title||!book.author||!book.license)return false;
 try{
  const download=new URL(book.downloadUrl),source=new URL(book.sourceUrl);
  return download.protocol==='https:'&&source.protocol==='https:'&&!download.username&&!download.password&&!download.port&&!source.username&&!source.password&&hosts[book.provider]?.includes(download.hostname);
 }catch{return false;}
}
// Only reviewed, size-bounded Chinese publication files enter search or download.
// A malformed entry is ignored without preventing the other source from working.
const books=(catalog.books||[]).filter(eligible);
export function searchOpenBooks(term,fold=s=>s.toLowerCase()){
 const query=fold(term.trim());if(!query)return [];
 return books.filter(b=>fold([b.title,b.author,...(b.aliases||[])].join(' ')).includes(query))
  .sort((a,b)=>a.title.length-b.title.length).slice(0,20)
  .map(b=>({id:b.id,title:b.title,author:b.author,language:'中文',provider:b.providerName,format:'EPUB 正文',source_url:b.sourceUrl,license:b.license}));
}
export function openBook(sourceId){
 requireThat(typeof sourceId==='string'&&/^oa:[a-z0-9-]{1,80}$/.test(sourceId),'请从搜索结果选择一本中文书');
 const book=books.find(b=>b.id===sourceId);requireThat(book,'请从搜索结果选择一本中文书',404);
 return {...book,aliases:[...(book.aliases||[])]};
}
export function openBookAttribution(book){
 return {title:'来源与许可',text:[
  '书名：'+book.title,'作者与译者：'+book.author,
  book.publisher?'出版信息：'+book.publisher:'',
  '书源：'+book.providerName,'版本介绍：'+(book.pageUrl||book.sourceUrl),
  book.catalogUrl?'来源目录：'+book.catalogUrl:'',
  '许可：'+book.license,book.licenseUrl||'',book.licenseNote||'',
  '原书署名和许可随书保留。本页不计入阅读奖励。'
 ].filter(Boolean).join('\n')};
}
