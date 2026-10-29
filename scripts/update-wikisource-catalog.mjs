// Build a title-only snapshot. Runtime acquisition uses the official WS Export
// service, which remains reachable when the wiki API is unavailable in China.
import {writeFileSync} from 'node:fs';
import * as OpenCC from 'opencc-js/t2cn';
const simplify=OpenCC.Converter({from:'t',to:'cn'}),books=new Map();
async function query(values){
 const url='https://zh.wikisource.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',formatversion:'2',...values});
 const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'StarlightReader/3.18 (+https://github.com/Syfyivan/starlight-checkin)'}});if(!r.ok)throw new Error('Wikisource '+r.status);const j=await r.json();if(j.error)throw new Error(j.error.code);return j;
}
// The live exports are incomplete: 朝花夕拾 misses four essays; 爱的教育 is unfinished; 道德经 exports a version index.
const unavailable=new Set([13866,353577,53670]);
const keep=p=>!unavailable.has(p.pageid)&&p.ns===0&&!p.missing&&!/[/:|]/.test(p.title)&&p.title.length<=70&&!/判[决決]|裁定[书書]|法院|法律|公[报報]|公告/.test(p.title);
for(const category of ['散文集','童話','童话','詩集','诗集','十三經','四書','小说','中国小说','長篇小說','长篇小说','短篇小說集','短篇小说集','中國古典小說','中国古典小说','中國文學','中国文学','儿童文学']){
 const j=await query({list:'categorymembers',cmtitle:'Category:'+category,cmlimit:'500',cmtype:'page'});
 for(const p of j.query?.categorymembers||[])if(keep(p))books.set(p.pageid,p);
 if(j.continue)console.log('Category has more entries; first 500 retained: '+category);
}
const named='論語|紅樓夢|西遊記|三國演義|水滸傳|聊齋志異|儒林外史|孟子|大學|中庸|詩經|道德經|莊子|史記|朝花夕拾|吶喊|彷徨|野草|故事新編|背影|愛的教育|小木頭人|愛麗絲漫遊奇境記|伊索寓言';
const j=await query({titles:named,redirects:'1',converttitles:'1',prop:'info'});for(const p of j.query?.pages||[])if(keep(p))books.set(p.pageid,p);
const entries=[...books.values()];
for(let i=0;i<entries.length;i+=20){
 const group=entries.slice(i,i+20),j=await query({titles:group.flatMap(p=>[p.title+'/全覽',p.title+'/全文']).join('|'),prop:'info'});
 const full=new Set((j.query?.pages||[]).filter(p=>!p.missing&&p.ns===0).map(p=>p.title));
 for(const p of group)p.exportTitle=full.has(p.title+'/全覽')?p.title+'/全覽':full.has(p.title+'/全文')?p.title+'/全文':p.title;
}
const data={updated:new Date().toISOString().slice(0,10),source:'https://zh.wikisource.org/',books:entries.map(p=>({id:p.pageid,title:p.title,aliases:simplify(p.title),exportTitle:p.exportTitle})).sort((a,b)=>a.id-b.id)};
writeFileSync('lib/wikisource-catalog.json',JSON.stringify(data,null,1)+'\n');console.log('Wikisource titles:',data.books.length);
