import {readFileSync} from 'node:fs';
import {Fault,requireThat,integer} from './store.mjs';
import {textChapters,BOOK_LIMITS} from '../public/book-text.js';
const catalog=JSON.parse(readFileSync(new URL('./book-catalog.json',import.meta.url),'utf8'));
const traditional='論語遊記國義紅樓夢學書詩經傳說兒詞選集華龍馬與風雲漢劍觀點萬歲禮東後臺聲愛頭時無發長樂從來為這個門會對畫歸終師孫莊寶張黃鳳總廣';
const simplified='论语游记国义红楼梦学书诗经传说儿词选集华龙马与风云汉剑观点万岁礼东后台声爱头时无发长乐从来为这个门会对画归终师孙庄宝张黄凤总广';
const fold=s=>String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/./gu,c=>{const at=traditional.indexOf(c);return at<0?c:simplified[at];});
const aliases={23839:'孔子论语',23962:'西游记吴承恩',25160:'王应麟三字经',12479:'三字经',11:'爱丽丝梦游仙境爱丽丝漫游奇境刘易斯卡罗尔',1342:'傲慢与偏见简奥斯汀',1661:'福尔摩斯探案柯南道尔',74:'汤姆索亚历险记马克吐温'};
export class BookSource {
 constructor(store,{fetcher=fetch}={}){this.s=store;this.fetcher=fetcher;this.running=0;}
 search(q=''){
  requireThat(typeof q==='string'&&q.length<=100,'书名或作者最多 100 个字');const needle=fold(q),books=catalog.books.filter(b=>!needle||fold(b.title+b.author+(aliases[b.id]||'')).includes(needle));
  books.sort((a,b)=>(b.id===23839)-(a.id===23839)||(a.language==='英文')-(b.language==='英文')||a.title.length-b.title.length);
  return {books:books.slice(0,30),message:`古腾堡经典书目 · 共 ${catalog.books.length} 本可检索，书目更新于 ${catalog.updated}。${books.length?'找到 '+books.length+' 本，显示前 '+Math.min(30,books.length)+' 本。':'这次没有找到，试试原文书名或导入自己的电子书。'}`};
 }
 async read(url,max,timeout=20000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);let response;
  try{
   response=await this.fetcher(url,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'StarlightReader/3.17 (+https://github.com/Syfyivan/starlight-checkin)'}});
   requireThat(response.ok,'书源暂时没有返回这本书，请稍后重试',502);requireThat(Number(response.headers.get('content-length')||0)<=max,'这本书太大，请使用自己的文件分册导入',413);
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;requireThat(size<=max,'这本书太大，请使用自己的文件分册导入',413);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');
  }catch(e){controller.abort();if(e instanceof Fault)throw e;throw new Fault('公开书源暂时连接不上，可以稍后再试，或导入手边的电子书',502);}finally{clearTimeout(timer);}
 }
 async download(sourceId){
  integer(sourceId,1,999999,'书目编号');const b=catalog.books.find(b=>b.id===sourceId);requireThat(b,'请从搜索结果选择一本书',404);
  const cached=this.s.get('SELECT value FROM book_catalog_cache WHERE key=?','pg:'+b.id);if(cached)return JSON.parse(cached.value);
  requireThat(this.running<2,'正有伙伴取书，请稍等一会儿再试',429);this.running++;
  try{
   const root='https://gutenberg.pglaf.org/cache/epub/'+b.id+'/pg'+b.id;
   const rights=await this.read(root+'.rdf',256*1024);requireThat(/<dcterms:rights>\s*Public domain in the USA\.\s*<\/dcterms:rights>/.test(rights),'这本书的开放阅读许可暂未核实，可以导入自己的合法副本',422);
   const text=await this.read(root+'.txt',BOOK_LIMITS.bytes);requireThat(text.includes('Project Gutenberg')&&!text.trim().startsWith('<'),'这本书没有可直接阅读的文本版本',422);
   const book={title:b.title.slice(0,160),author:b.author.slice(0,160),chapters:textChapters(text)},source={url:'https://www.gutenberg.org/ebooks/'+b.id,name:'Project Gutenberg · '+b.id},result={book,source};
   requireThat(book.chapters.length<=BOOK_LIMITS.chapters&&Buffer.byteLength(JSON.stringify(book))<=BOOK_LIMITS.bytes,'这本书较长，请分册导入',413);
   // Keep at most eight shared source copies; personal reading records are separate.
   this.s.run('INSERT OR REPLACE INTO book_catalog_cache VALUES(?,?,?)','pg:'+b.id,JSON.stringify(result),Date.now());
   this.s.run('DELETE FROM book_catalog_cache WHERE key NOT IN (SELECT key FROM book_catalog_cache ORDER BY updated DESC LIMIT 8)');return result;
  }finally{this.running--;}
 }
}
