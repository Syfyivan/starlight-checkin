import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {Store} from '../lib/store.mjs';
import {BookSource} from '../lib/book-source.mjs';
import {openBook,searchOpenBooks} from '../lib/open-books.mjs';

const catalog=JSON.parse(readFileSync(new URL('../lib/open-books-catalog.json',import.meta.url),'utf8')).books;
const directId='oa:dc-lunyu',archiveId='oa:hk-9789882379749';
const body='学习需要认真思考，也需要理解书中的知识。读过之后，试着把新的发现分享给身边的朋友。'.repeat(50);
function store(t){const s=new Store(':memory:');t.after(()=>s.db.close());return s;}
// Small synthetic EPUBs exercise parsing without fetching or storing real books.
function zip(entries){
 const files=[],directory=[];let offset=0;
 for(const [name,value] of Object.entries(entries)){
  const n=Buffer.from(name),original=Buffer.from(value),data=deflateRawSync(original),h=Buffer.alloc(30),d=Buffer.alloc(46);
  h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(original.length,22);h.writeUInt16LE(n.length,26);
  d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,6);d.writeUInt16LE(8,10);d.writeUInt32LE(data.length,20);d.writeUInt32LE(original.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);
  files.push(h,n,data);directory.push(d,n);offset+=h.length+n.length+data.length;
 }
 const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(directory.length/2,8);end.writeUInt16LE(directory.length/2,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...files,dir,end]);
}
function epub(text=body){return zip({
 'mimetype':'application/epub+zip',
 'META-INF/container.xml':'<container><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 'book.opf':'<package version="3.0"><metadata><title>未命名书籍</title><creator>缺失署名</creator><language>en</language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
 'c1.xhtml':'<html><body><h1>正文</h1><p>'+text+'</p></body></html>'
});}

test('reviewed catalog contains only size-bounded Chinese EPUBs with unique edition URLs',()=>{
 assert.equal(new Set(catalog.map(b=>b.id)).size,catalog.length);
 assert.equal(new Set(catalog.map(b=>b.sourceUrl)).size,catalog.length);
 assert.ok(catalog.some(b=>b.provider==='openbookshk'));
 assert.ok(catalog.some(b=>b.provider==='digitalclassics'));
 for(const b of catalog){
  assert.equal(b.language,'中文');assert.equal(b.format,'epub');assert.equal(b.complete,true);
  assert.ok(Number.isInteger(b.bytes)&&b.bytes>0&&b.bytes<=10*1024*1024);
  assert.equal(new URL(b.downloadUrl).protocol,'https:');assert.ok(b.license&&b.licenseUrl&&b.author);
  assert.deepEqual(openBook(b.id),b);
 }
 assert.throws(()=>openBook('oa:dc-xunzi'),/搜索结果/);
 assert.throws(()=>openBook('oa:dc-laozi-heshang-hans'),/搜索结果/);
});

test('mixed search is local, supports catalog aliases and never invents modern Chinese full texts',async t=>{
 const source=new BookSource(store(t),{fetcher:()=>{throw Error('search must not fetch');}});
 for(const q of ['论语','論語'])assert.ok((await source.searchAll(q)).books.some(b=>b.id===directId));
 for(const q of ['历史不止一种写法','歷史不止一種寫法'])assert.ok((await source.searchAll(q)).books.some(b=>b.id===archiveId));
 assert.ok((await source.searchAll('戰國策')).books.some(b=>b.id==='oa:dc-zhanguoce'));
 for(const q of ['三体','算法导论','小海蒂'])assert.equal((await source.searchAll(q)).books.some(b=>String(b.id).startsWith('oa:')),false);
 for(const q of ['论语','毛升','孟子'])assert.ok((await source.searchAll(q)).books.every(b=>b.language==='中文'));
 assert.deepEqual(searchOpenBooks(''),[]);
});

test('oa whitelist is checked before cache; IDs cannot supply a remote URL',async t=>{
 const s=store(t);let fetched=0;const source=new BookSource(s,{fetcher:()=>{fetched++;throw Error('unexpected network');}});
 s.run('INSERT INTO book_catalog_cache VALUES(?,?,?)','oa:unknown','{"book":{"title":"not reviewed"}}',Date.now());
 for(const id of ['oa:unknown','oa:https://example.com/book.epub','oa:../book','oa:dc-lunyu?url=https://example.com'])await assert.rejects(source.download(id),/搜索结果/);
 assert.equal(fetched,0);
});

test('download dispatch preserves existing wiki and Gutenberg paths',async t=>{
 const s=store(t),source=new BookSource(s);source.downloadWiki=async id=>({route:'wiki',id});source.downloadOpen=async id=>({route:'open',id});
 assert.deepEqual(await source.download('ws:6'),{route:'wiki',id:'ws:6'});
 assert.deepEqual(await source.download(directId),{route:'open',id:directId});
 s.run('INSERT INTO book_catalog_cache VALUES(?,?,?)','pg:23839','{"route":"gutenberg"}',Date.now());
 assert.deepEqual(await source.download(23839),{route:'gutenberg'});
});

test('direct EPUB verifies Chinese body, overrides broken metadata, preserves attribution and caches',async t=>{
 const s=store(t);let fetched=0;const detail=openBook(directId),source=new BookSource(s,{fetcher:async (url,options)=>{
  fetched++;assert.equal(url,detail.downloadUrl);assert.equal(options.redirect,'error');return new Response(epub());
 }});
 const result=await source.download(directId);
 assert.equal(result.book.title,detail.title);assert.equal(result.book.author,detail.author);
 assert.equal(result.source.url,detail.sourceUrl);assert.equal(result.source.name,'数位经典');
 assert.ok(result.book.chapters.some(c=>c.text.includes(body)));
 const last=result.book.chapters.at(-1);assert.equal(last.title,'来源与许可');assert.ok(last.text.includes(detail.licenseUrl));assert.ok(last.text.includes(detail.pageUrl));
 assert.deepEqual(await source.download(directId),result);assert.equal(fetched,1);assert.equal(source.running,0);
});

test('HK outer ZIP is unwrapped with the same 10 MiB and 30 second read budget',async t=>{
 const source=new BookSource(store(t)),detail=openBook(archiveId);let calls=0;
 source.read=async (url,max,timeout,binary)=>{calls++;assert.equal(url,detail.downloadUrl);assert.equal(max,10*1024*1024);assert.equal(timeout,30000);assert.equal(binary,true);return zip({'publication.epub':epub()});};
 const result=await source.download(archiveId);
 assert.equal(calls,1);assert.equal(result.book.title,detail.title);assert.equal(result.book.author,detail.author);
 assert.ok(result.book.chapters.at(-1).text.includes('CC BY-NC-ND 4.0'));assert.equal(result.source.url,detail.sourceUrl);
});

test('failed or changed sources cannot be cached as a book and do not disable other search',async t=>{
 const s=store(t);
 for(const [response,pattern] of [
  [()=>new Response('<html>暂时无法下载</html>'),/完整电子书/],
  [()=>new Response('unavailable',{status:503}),/书源暂时/],
  [()=>new Response('small',{headers:{'content-length':String(10*1024*1024+1)}}),/太大/],
  [()=>new Response(epub('中文片段，只含一小段简介。')),/正文不足/],
  [()=>new Response(epub('This is a complete English book, but it is not a Chinese edition. '.repeat(70))),/中文正文不足/]
 ]){
  const source=new BookSource(s,{fetcher:async()=>response()});await assert.rejects(source.download(directId),pattern);
  assert.equal(source.running,0);assert.equal(s.get('SELECT value FROM book_catalog_cache WHERE key=?',directId),undefined);
  assert.ok((await source.searchAll('历史不止一种写法')).books.some(b=>b.id===archiveId));
 }
});

test('open source parsing is serialized and the running slot is released',async t=>{
 let release;const ready=new Promise(resolve=>{release=resolve;}),source=new BookSource(store(t),{fetcher:async()=>{await ready;return new Response(epub());}});
 const first=source.download(directId);assert.equal(source.running,1);
 await assert.rejects(source.download('oa:dc-mengzi'),/稍等/);release();await first;assert.equal(source.running,0);
});

test('shared source cache stays bounded to eight copies after open-source reads',async t=>{
 const s=store(t);
 for(let i=0;i<8;i++)s.run('INSERT INTO book_catalog_cache VALUES(?,?,?)','old:'+i,'{}',i+1);
 const source=new BookSource(s,{fetcher:async()=>new Response(epub())});await source.download(directId);
 assert.equal(s.all('SELECT key FROM book_catalog_cache').length,8);assert.equal(s.get('SELECT key FROM book_catalog_cache WHERE key=?','old:0'),undefined);
 assert.ok(s.get('SELECT key FROM book_catalog_cache WHERE key=?',directId));
});

test('prepared public files work without upstream access and survive parsed-cache eviction',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'starlight-source-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const data=epub(),b=openBook(directId),manifest={version:1,books:[{id:b.id,url:b.downloadUrl,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}]};
 writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));writeFileSync(join(dir,'dc-lunyu.bin'),data);
 const s=store(t),source=new BookSource(s,{sourceCacheDir:dir,fetcher:()=>{throw Error('Network must not be used');}});
 assert.equal((await source.download(directId)).book.title,b.title);
 s.run('DELETE FROM book_catalog_cache');
 assert.equal((await source.download(directId)).book.title,b.title);
 for(const change of ['hash','url','size']){
  s.run('DELETE FROM book_catalog_cache');const invalid=structuredClone(manifest);
  if(change==='hash')invalid.books[0].sha256='0'.repeat(64);
  if(change==='url')invalid.books[0].url='https://example.com/other.epub';
  if(change==='size')invalid.books[0].bytes=10*1024*1024+1;
  writeFileSync(join(dir,'manifest.json'),JSON.stringify(invalid));
  await assert.rejects(source.download(directId),/副本校验/);assert.equal(source.running,0);
 }
});

test('missing prepared source files use the normal bounded download; oversized index is rejected',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'starlight-source-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const s=store(t);let calls=0;const source=new BookSource(s,{sourceCacheDir:dir,fetcher:async()=>{calls++;return new Response(epub());}});
 await source.download(directId);assert.equal(calls,1);s.run('DELETE FROM book_catalog_cache');
 writeFileSync(join(dir,'manifest.json'),' '.repeat(32*1024+1));
 await assert.rejects(source.download(directId),/副本暂不可用/);assert.equal(calls,1);
 writeFileSync(join(dir,'manifest.json'),'null');
 await assert.rejects(source.download(directId),e=>e.status===503);assert.equal(calls,1);
});
