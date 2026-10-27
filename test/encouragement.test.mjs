import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Encouragement,normalizeQuote} from '../lib/encouragement.mjs';
import {createApp} from '../server.mjs';
const poem={type:'i',hitokoto:'欲穷千里目，更上一层楼。',from_who:'王之涣',from:'登鹳雀楼',uuid:'12345678-1234-1234-1234-123456789abc'};
const response=data=>Response.json(data);

test('在线来源只保留短诗、可信作者和安全出处，不接受链接或 HTML',()=>{
 assert.deepEqual(normalizeQuote(poem),{text:poem.hitokoto,attribution:'王之涣《登鹳雀楼》',source:'一言·诗词',url:'https://hitokoto.cn/?uuid='+poem.uuid});
 for(const patch of [{type:'a'},{from_who:'未知来源'},{hitokoto:'春光'},{hitokoto:'春'.repeat(31)},{hitokoto:'春光<script>来了</script>'},{from:'https://example.com'},{hitokoto:'春风之中充满了悲伤和绝望。'},{uuid:'javascript:alert(1)'}])assert.equal(normalizeQuote({...poem,...patch}),null);
});

test('服务端合并并发、缓存 30 秒，固定请求不携带用户数据',async()=>{
 let calls=0,now=1000,release;const gate=new Promise(r=>release=r);
 const source=new Encouragement({clock:()=>now,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://v1.hitokoto.cn/?c=i&min_length=8&max_length=30');assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);await gate;return response(poem);}});
 const a=source.get(),b=source.get();release();assert.deepEqual(await a,await b);assert.equal(calls,1);await source.get();assert.equal(calls,1);now+=30001;assert.ok((await source.get()).quote);assert.equal(calls,2);
});

test('超时、非 JSON、坏数据、超大响应均安全回退，失败也缓存避免反复请求',async()=>{
 for(const fetcher of [async()=>{throw Error('timeout');},async()=>new Response('error',{status:503}),async()=>new Response('<html>no</html>'),async()=>new Response('{bad',{headers:{'Content-Type':'application/json'}}),async()=>response({...poem,from:'x'.repeat(20000)})]){
  let calls=0;const source=new Encouragement({fetcher:async(...args)=>{calls++;return fetcher(...args);}});assert.deepEqual(await source.get(),{quote:null});assert.deepEqual(await source.get(),{quote:null});assert.equal(calls,1);
 }
});

test('诗句 HTTP 接口需要登录、限流、不会向外发送 Cookie；新模块可正常加载',async t=>{
 let calls=0;const {server,store}=await createApp({dbPath:':memory:',quoteFetcher:async()=>{calls++;return response(poem);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{store.db.close();r();})));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/celebration/quote')).status,401);assert.equal(calls,0);
 const user=store.newUser({username:'quotes_user',name:'诗句测试',password:'unused',role:'member'}),session=store.session(user.id);
 const headers={Cookie:'starlight_session='+session.token};const r=await fetch(base+'/api/celebration/quote',{headers});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).quote.text,poem.hitokoto);
 for(let i=0;i<39;i++)assert.equal((await fetch(base+'/api/celebration/quote',{headers})).status,200);
 assert.equal((await fetch(base+'/api/celebration/quote',{headers})).status,429);assert.equal(calls,1);
 for(const file of ['celebration-art.js','celebration-content.js'])assert.equal((await fetch(base+'/'+file)).status,200);
 assert.equal((await fetch(base+'/lib/encouragement.mjs')).status,404);
});
