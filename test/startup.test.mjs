import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fetchJSON,requestId} from '../public/compat.js';
import {createApp} from '../server.mjs';

test('旧内核没有 randomUUID 时仍用安全随机数生成请求标识，保留去重功能',()=>{
  let calls=0;
  const source={getRandomValues(bytes){calls++;return crypto.getRandomValues(bytes);}};
  const ids=Array.from({length:100},()=>requestId(source));
  assert.equal(calls,100);assert.equal(new Set(ids).size,100);
  for(const id of ids)assert.match(id,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.throws(()=>requestId({}),/安全连接/);
});

test('请求不依赖 AbortSignal.timeout，超时包含响应正文并真正中止网络请求',async t=>{
  t.mock.method(AbortSignal,'timeout',()=>{throw Error('not available');});
  let signal;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{
    signal=options.signal;
    return {json:()=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))};
  });
  await assert.rejects(fetchJSON('/slow',{},10),/连接有点慢/);
  assert.equal(signal.aborted,true);
});

test('响应完成后清除超时定时器，保留 HTTP 错误供登录和权限处理',async t=>{
  let signal;
  t.mock.method(globalThis,'fetch',async (_url,options)=>{signal=options.signal;return {ok:false,status:401,json:async()=>({error:'请先登录'})};});
  const {response,data}=await fetchJSON('/state',{},10);
  assert.equal(response.status,401);assert.equal(data.error,'请先登录');
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(signal.aborted,false);
});

function startup(userAgent='Chrome/83.0 Android'){
  const elements=new Map(['startup-loading','startup-message','startup-hint','startup-actions','startup-detail','startup-retry'].map(id=>[id,{textContent:'',hidden:true,addEventListener(){}}]));
  const listeners={},window={},timers=new Map();
  window.addEventListener=(type,callback)=>{listeners[type]=callback;};
  const document={readyState:'loading',getElementById:id=>elements.get(id),addEventListener:(type,callback)=>{listeners[type]=callback;}};
  vm.runInNewContext(readFileSync(new URL('../public/startup.js',import.meta.url),'utf8'),{window,document,navigator:{userAgent},location:{reload(){}},setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)});
  return {elements,listeners,window,document,timers,domReady(){document.readyState='interactive';listeners.DOMContentLoaded();}};
}

test('模块解析或下载失败时不再无限加载，重连按钮不依赖应用模块',()=>{
  for(const event of [{error:new SyntaxError('Unexpected token =')},{target:{tagName:'SCRIPT'}}]){
    const s=startup();s.listeners.error(event);s.domReady();
    assert.equal(s.elements.get('startup-actions').hidden,false);
    assert.match(s.elements.get('startup-detail').textContent,/script · 内核 83/);
    assert.equal(s.timers.size,0);
  }
});

test('很旧的网页内核得到明确提示，静默卡住也有超时出口',()=>{
  const old=startup('Android; Chrome/74.0');old.domReady();old.timers.get(1)();
  assert.match(old.elements.get('startup-hint').textContent,/Android System WebView/);
  const s=startup();s.domReady();s.timers.get(1)();
  assert.match(s.elements.get('startup-detail').textContent,/timeout/);
});

test('首页启动成功后不会因异步动画报错而覆盖正在使用的页面',()=>{
  const s=startup();s.domReady();const timeout=s.timers.get(1);s.window.StarlightStartup.ready();
  s.listeners.error({error:new Error('optional animation')});timeout();
  assert.equal(s.elements.get('startup-actions').hidden,true);assert.equal(s.timers.size,0);
});

test('启动保护脚本和兼容模块可公开加载，继续保持同源 CSP',async t=>{
  const {server,store}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(()=>{store.db.close();r();})));
  const base='http://127.0.0.1:'+server.address().port;
  for(const file of ['startup.js','compat.js']){const r=await fetch(base+'/'+file);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);}
  const html=await(await fetch(base)).text();assert.ok(html.indexOf('src="./startup.js"')<html.indexOf('src="./app.js"'));
});
