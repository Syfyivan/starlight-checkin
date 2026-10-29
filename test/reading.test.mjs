import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {BookSource} from '../lib/book-source.mjs';
import {createApp} from '../server.mjs';
import {migrate} from '../lib/migrate.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {deflateRawSync} from 'node:zlib';
import {textChapters} from '../public/book-text.js';
import {parseSourceEpub} from '../lib/wikisource.mjs';
const longText='子曰：学习要常常温习，也要认真想一想，今天学到了什么。\n'.repeat(50);
function fixture(t){const s=new Store(':memory:');t.after(()=>s.db.close());const a=s.newUser({username:'reader',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),x=s.newUser({username:'stranger',name:'小云',password:''}),space=s.pair(a.id,g.id).space_id;
 const op=(u,method,b={},key=randomUUID())=>s.operation(u,key,'/api/reading/'+method,{space_id:space,...b},()=>s.reading[method](u,{space_id:space,...b}));
 const add=(b={})=>op(a,'import',{book:{title:'阅读练习',author:'作者',chapters:[{title:'一',text:longText},{title:'二',text:'新的章节，新的一点想法。'}],...b}}).book_id;
 return {s,a,g,x,space,op,add};}
test('书架、章节、笔记、整本奖励到经验的链路；重试与重导不重复发币',t=>{
 const {s,a,space,op,add}=fixture(t),book=add(),version=s.reading.rules(space).version;
 assert.equal(s.balance(space),0);op(a,'position',{book_id:book,chapter:0,done:true});
 assert.throws(()=>op(a,'finish',{book_id:book,review:'收获'.repeat(30),version}),/每个小节/);
 op(a,'position',{book_id:book,chapter:1,done:true});const key=randomUUID(),body={book_id:book,review:'收获'.repeat(30),version};
 assert.equal(op(a,'finish',body,key).coins,100);assert.equal(op(a,'finish',body,key).coins,100);assert.throws(()=>op(a,'finish',body),/领取过/);
 for(let i=0;i<6;i++)assert.equal(op(a,'note',{book_id:book,chapter:0,text:'我的新想法：'+i+'学习以后需要认真温习，也需要和伙伴一起交流。',version}).coins,i<5?5:0);
 assert.equal(s.balance(space),125*COIN);assert.equal(s.pets.state(space).readingXp,125);assert.equal(s.pets.state(space).xp,125);
 assert.equal(add({title:'改了书名'}),book);assert.equal(s.reading.list(a,{space_id:space}).books.length,1);assert.equal(s.balance(space),125*COIN);
 assert.throws(()=>op(a,'note',{book_id:book,chapter:0,text:'我的新想法：0学习以后需要认真温习，也需要和伙伴一起交流。',version}),/已经记过/);
 assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});
test('只有本人能读私有正文和记进度；发奖人可看笔记和配奖，陌生人不能查看',t=>{
 const {s,a,g,x,space,op,add}=fixture(t),book=add(),version=s.reading.rules(space).version;
 op(a,'note',{book_id:book,chapter:0,text:'想把今天读到的知识用在明天的学习里，坚持记录自己的小发现。',version});
 const q={space_id:space,book_id:book};assert.ok(s.reading.detail(a,q).content);assert.equal(s.reading.detail(g,q).content,null);assert.equal(s.reading.detail(g,q).notes.length,1);
 assert.throws(()=>s.reading.detail(x,q),/没有向你开放/);assert.throws(()=>op(g,'position',{book_id:book,chapter:0,done:true}),/领奖人/);
 assert.throws(()=>op(a,'saveRules',{enabled:true,finish:999,note:20,noteLimit:20,version}),/发奖人/);
 op(g,'saveRules',{enabled:true,finish:200,note:2,noteLimit:1,version});assert.equal(s.reading.rules(space).finish,200);
 assert.throws(()=>op(a,'note',{book_id:book,chapter:0,text:'这里是另外一个新的想法，想要认真学习并且多多练习。',version}),/刚调整/);
 assert.throws(()=>s.reading.detail(a,{...q,space_id:s.personalSpaceId(a.id)}),/先把书/);
});
test('关闭奖励、短文、非法章节、配额与事务失败都不会偷偷加币',t=>{
 const {s,a,g,space,op,add}=fixture(t),book=add({chapters:[{title:'短篇',text:'短篇文字'}]}),version=s.reading.rules(space).version;
 op(a,'position',{book_id:book,chapter:0,done:true});assert.equal(op(a,'finish',{book_id:book,review:'短篇也有自己的收获和理解，继续阅读以后还能学到更多不同的知识。'.repeat(2),version}).coins,0);
 assert.throws(()=>op(a,'position',{book_id:book,chapter:-1}),/阅读位置/);assert.throws(()=>add({chapters:[{text:'x'.repeat(24001)}]}),/太长/);
 const b2=add(),orig=s.community.audit;s.community.audit=()=>{throw new Error('audit fails');};assert.throws(()=>op(a,'note',{book_id:b2,chapter:0,text:'这条新的阅读笔记有很好的收获，但是记录失败的时候也不能发币。',version}),/audit fails/);s.community.audit=orig;assert.equal(s.balance(space),0);assert.equal(s.get('SELECT COUNT(*) n FROM reading_notes').n,0);
 op(g,'saveRules',{enabled:false,finish:100,note:5,noteLimit:5,version});assert.equal(op(a,'note',{book_id:b2,chapter:0,text:'关掉奖励仍然可以写下新的想法，把自己的收获好好记下来。',version:s.reading.rules(space).version}).coins,0);
});
test('公开书源的许可文字不计入阅读长度，书源更新也不创建第二份奖励',t=>{
 const {s,a,space,add}=fixture(t),source={url:'https://www.gutenberg.org/ebooks/1',name:'Project Gutenberg'};
 const book={title:'短文',chapters:[{title:'正文',text:'Project Gutenberg\n*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\n短文\n*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\n'+longText}]};
 const first=s.tx(()=>s.reading.import(a,{space_id:space,book},source));assert.equal(s.get('SELECT characters FROM reading_books WHERE id=?',first.book_id).characters,2);
 book.chapters[0].text=longText;assert.equal(s.tx(()=>s.reading.import(a,{space_id:space,book},source)).book_id,first.book_id);assert.equal(s.get('SELECT COUNT(*) n FROM reading_books').n,1);
});
test('家庭阅读规则共享，个人进度和币分开，管家看见记录',t=>{
 const {s,a,g,x,op}=fixture(t),f=s.community.createFamily(a,{name:'一起读书',mode:'friends'}),inv=s.community.familyInvite(a,{space_id:f.space_id}),joined=s.acceptInvite(g,inv.code);
 const space=f.space_id,other=joined.space_id,b={title:'家里的书',chapters:[{title:'第一章',text:longText}]};
 s.tx(()=>s.reading.saveRules(a,{space_id:space,enabled:true,finish:50,note:3,noteLimit:2,version:s.reading.rules(space).version}));assert.equal(s.reading.rules(other).finish,50);
 const r=s.tx(()=>s.reading.import(g,{space_id:other,book:b}));s.tx(()=>s.reading.note(g,{space_id:other,book_id:r.book_id,chapter:0,text:'一起读书的时候，我想和大家交流自己的想法，把看到的新知识记下来。',version:s.reading.rules(other).version}));
 assert.equal(s.balance(space),0);assert.equal(s.balance(other),3*COIN);assert.equal(s.reading.list(a,{space_id:other}).books.length,1);assert.throws(()=>s.reading.list(x,{space_id:other}),/没有向你开放/);
});
test('公开书源只取白名单书目、核实许可、限流和体积；正文缓存复用',async t=>{
 const {s}=fixture(t);let requests=[];const source=new BookSource(s,{fetcher:async url=>{requests.push(url);return new Response(url.endsWith('.rdf')?'<dcterms:rights>Public domain in the USA.</dcterms:rights>':'Project Gutenberg\n'+longText);}});
 assert.ok(source.search('论语').books.some(b=>b.id===23839));assert.ok(source.search('').books.every(b=>b.language==='中文'));assert.ok(source.search('').books.length<=30);
 const r=await source.download(23839);assert.ok(r.book.chapters.length);await source.download(23839);assert.equal(requests.length,2);assert.ok(requests.every(u=>u.startsWith('https://gutenberg.pglaf.org/cache/epub/23839/')));
 await assert.rejects(source.download('https://127.0.0.1'),/书目编号/);await assert.rejects(source.download(999999),/搜索结果/);
 s.run('DELETE FROM book_catalog_cache');source.fetcher=async()=>new Response('<dcterms:rights>Copyrighted.</dcterms:rights>');await assert.rejects(source.download(23839),/许可/);
 source.fetcher=async()=>new Response('x',{headers:{'content-length':'9000000'}});await assert.rejects(source.download(23839),/太大/);
 assert.equal(source.running,0);
});

// Tiny stored-ZIP fixture: the production test runner needs no npm dependencies.
function zip(entries,compressed=false){let local=[],directory=[],offset=0;for(const [name,value] of Object.entries(entries)){const n=Buffer.from(name),original=Buffer.from(value),data=compressed?deflateRawSync(original):original,h=Buffer.alloc(30),d=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(compressed?8:0,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(compressed&&name==='c1.xhtml'?1:original.length,22);h.writeUInt16LE(n.length,26);d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,6);d.writeUInt16LE(compressed?8:0,10);d.writeUInt32LE(data.length,20);d.writeUInt32LE(compressed&&name==='c1.xhtml'?1:original.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);local.push(h,n,data);directory.push(d,n);offset+=h.length+n.length+data.length;}const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(directory.length/2,8);end.writeUInt16LE(directory.length/2,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);}
export function epubFixture(){return {'mimetype':'application/epub+zip','META-INF/container.xml':'<container><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>','book.opf':'<package version="3.0"><metadata><title>小芽的阅读冒险</title><creator>小芽</creator></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>','c1.xhtml':'<html><head><title>unsafe</title></head><body><h1>第一章 好奇心</h1><script>alert(1)</script><p>'+longText+'</p><img src="https://tracking.invalid/pixel" /></body></html>'};}
test('浏览器版解析器读取 EPUB 2/3，去掉脚本与资源；阻止路径穿越、实体和超限文件',async()=>{
 const context={Uint8Array,ArrayBuffer,DataView,TextDecoder,TextEncoder,Promise,setTimeout,clearTimeout,setImmediate};vm.runInNewContext(readFileSync(new URL('../public/vendor/ebook-parser.js',import.meta.url),'utf8'),context);const parse=context.StarlightEbooks.parseEpub;
 const entries=epubFixture(),b=await parse(zip(entries));assert.equal(b.title,'小芽的阅读冒险');assert.ok(b.chapters[0].text.includes('好奇心'));assert.ok(!b.chapters[0].text.includes('alert'));assert.ok(!JSON.stringify(b).includes('tracking.invalid'));
 await assert.rejects(parse(zip({...entries,'../escape':'bad'})),/不安全路径/);await assert.rejects(parse(zip({...entries,'META-INF/encryption.xml':'x'})),/加密/);
 await assert.rejects(parse(zip({...entries,'c1.xhtml':'<!DOCTYPE x [<!ENTITY x "hello">]><html><body>&x;</body></html>'})),/实体/);
 await assert.rejects(parse(new Uint8Array(10*1024*1024+1)),/10 MB/);
 const v2=await parse(zip({...entries,'book.opf':entries['book.opf'].replace('version="3.0"','version="2.0"')}));assert.equal(v2.title,b.title);
 await assert.rejects(parse(zip({...entries,'c1.xhtml':'<html><body>'+'x'.repeat(3*1024*1024)+'</body></html>'},true)),/正文太大/);
 await assert.rejects(parse(zip({...entries,'c1.xhtml':'<html><body>'+'<div>'.repeat(110)+'hello'+'</div>'.repeat(110)+'</body></html>'})),/复杂/);
});
test('旧改名升级后从迁移时计七天，仅卡片改名生效，重复迁移不延期',t=>{
 const {s,a,g,space}=fixture(t);s.addTemplates(g,{space_id:space,templates:['room-rename']});s.post(space,100*COIN,'test','test','test');const p=s.get("SELECT id FROM prizes WHERE room_id=? AND effect='room_rename'",space),card=s.buy(a,{space_id:space,prize_id:p.id}).card;
 s.operation(a,randomUUID(),'/api/cards/rename-room',{space_id:space,card_id:card.id,name:'旧招牌',expected_name:''},()=>s.renameRoom(a,{space_id:space,card_id:card.id,name:'旧招牌',expected_name:''}));
 s.run('DELETE FROM room_renames');s.db.exec('PRAGMA user_version=19');const at=Date.now();migrate(s.db);const row=s.get('SELECT * FROM room_renames WHERE space_id=?',space);assert.equal(row.default_name,'');assert.ok(row.expires>=at+7*86400000);assert.ok(row.expires<at+7*86400000+1000);migrate(s.db);assert.equal(s.get('SELECT expires FROM room_renames WHERE space_id=?',space).expires,row.expires);s.expireRoomNames(row.expires);assert.equal(s.get('SELECT room_name FROM spaces WHERE id=?',space).room_name,'');
});
test('HTTP 阅读路径需要登录与 CSRF，新增静态资源能访问且服务端文件不泄露',async t=>{
 const app=await createApp({dbPath:':memory:'}),s=app.store;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));s.db.close();});const origin='http://127.0.0.1:'+app.server.address().port;
 assert.equal((await fetch(origin+'/api/reading/library')).status,401);for(const path of ['reading.js','reading.css','book-text.js','ebook-worker.js','vendor/ebook-parser.js','vendor/book-display.js','vendor/OPENCC-LICENSES.txt'])assert.equal((await fetch(origin+'/'+path)).status,200);assert.equal((await fetch(origin+'/lib/book-catalog.json')).status,404);
 const u=s.newUser({username:'httpreader',name:'小芽',password:''}),session=s.session(u.id),cookie='starlight_session='+session.token;
 for(const q of ['','论语','小海蒂','Heidi','Alice']){const r=await fetch(origin+'/api/reading/search?q='+encodeURIComponent(q),{headers:{Cookie:cookie}});assert.equal(r.status,200);const data=await r.json();assert.ok(data.books.every(b=>b.language==='中文'));if(q==='论语')assert.ok(data.books.some(b=>b.id==='ws:6'));}
 const r=await fetch(origin+'/api/reading/import',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({})});assert.equal(r.status,403);
});

test('多书源仅返回中文，简繁兼容，旧英文编号及缓存也不能用于取书',async t=>{
 const {s}=fixture(t);let requests=0;const source=new BookSource(s,{fetcher:async()=>{requests++;throw new Error('Search must not use network');}});
 for(const q of ['小海蒂','Heidi','Alice','Pride and Prejudice']){const r=await source.searchAll(q);assert.ok(r.books.every(b=>b.language==='中文'));assert.ok(!r.books.some(b=>[1448,46409,11,1342].includes(b.id)));}
 const first=await source.searchAll('小海蒂');assert.equal(first.books.length,0);assert.match(first.message,/暂未找到.*中文/);
 const catalog=JSON.parse(readFileSync(new URL('../lib/book-catalog.json',import.meta.url),'utf8'));assert.ok(catalog.books.length>0);assert.ok(catalog.books.every(b=>b.language==='中文'));
 s.run('INSERT INTO book_catalog_cache(key,value,updated) VALUES(?,?,?)','pg:1448',JSON.stringify({book:{title:'Heidi'}}),Date.now());
 await assert.rejects(source.download(1448),/中文书/);await assert.rejects(source.download(11),/中文书/);
 for(const name of ['论语','論語']){const results=await source.searchAll(name);assert.equal(results.books[0].id,'ws:6');assert.ok(results.books.some(b=>b.id===23839));assert.ok(!results.books.some(b=>/判决|裁定/.test(b.title)));}
 assert.ok(!(await source.searchAll('朝花夕拾')).books.some(b=>b.id==='ws:13866'));
 assert.equal(requests,0);await assert.rejects(source.searchAll('x'.repeat(101)),/100/);
});

test('维基文库取书使用固定域名、全览去重、隔离解析、缓存和计奖去许可',async t=>{
 const {s,a,space}=fixture(t),requests=[],entries=epubFixture();
 entries['book.opf']=entries['book.opf'].replace('</manifest>','<item id="about" href="about.xhtml" media-type="application/xhtml+xml"/></manifest>').replace('</spine>','<itemref idref="about"/></spine>');
 entries['c1.xhtml']='<html><head><title>学而第一</title></head><body><table class="ws-header"><tr><td>不要出现在正文的导航</td></tr></table><p>学而第一</p><p>'+longText+'</p></body></html>';
 entries['about.xhtml']='<html><body><p>'+longText.repeat(2)+'</p></body></html>';
 const bytes=zip(entries),source=new BookSource(s,{fetcher:async raw=>{requests.push(raw);const u=new URL(raw);assert.equal(u.hostname,'ws-export.wmcloud.org');assert.equal(u.searchParams.get('page'),'論語/全覽');return new Response(bytes);}});
 const r=await source.download('ws:6');assert.equal(r.book.title,'論語');assert.ok(!r.book.chapters[0].text.includes('不要出现'));assert.equal(r.book.chapters.at(-1).title,'来源与许可');
 const imported=s.tx(()=>s.reading.import(a,{space_id:space,book:r.book},r.source));const row=s.get('SELECT characters FROM reading_books WHERE id=?',imported.book_id);assert.equal(row.characters,r.book.chapters[0].text.replace(/\s/g,'').length);
 assert.equal(s.tx(()=>s.reading.import(a,{space_id:space,book:r.book},r.source)).book_id,imported.book_id);await source.download('ws:6');assert.equal(requests.length,1);
 assert.ok(requests.every(u=>['ws-export.wmcloud.org'].includes(new URL(u).hostname)));assert.equal(source.running,0);
 await assert.rejects(source.download('ws:../127.0.0.1'),/搜索结果/);
 await assert.rejects(source.download('ws:9999999999'),/搜索结果/);assert.equal(requests.length,1);
 await assert.rejects(parseSourceEpub(Buffer.from('invalid')),/整理好/);
 await assert.rejects(parseSourceEpub(zip({...entries,'c1.xhtml':'<html><body><p>此文档未完成，一部分的原作內容還未录入。</p></body></html>'})),/尚未收齐/);
});

test('中文篇名识别与简体显示不会改写原文',async()=>{
 const chapters=textChapters('學而第一\n子曰：學而時習之。\n堯曰第二十\n末篇文字。');assert.equal(chapters.length,2);assert.equal(chapters[1].title,'堯曰第二十');
 const {simplify}=await import('../public/vendor/book-display.js');const original='學而時習之，不亦說乎？';assert.equal(simplify(original),'学而时习之，不亦说乎？');assert.equal(original,'學而時習之，不亦說乎？');
});
