import test from 'node:test';
import assert from 'node:assert/strict';
import {friendChatUI} from '../public/chat.js';

const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const message=(seq,body,sender='b')=>({seq,id:'m'+seq,sender_id:sender,recipient_id:sender==='b'?'a':'b',body,created:'2026-10-28T12:00:00.000Z'});
function fixture(api){
 let state={user:{id:'a'},community:{friends:[{id:'b',unread:1}],chatUnread:1}},html='',nodes={};const listeners={};
 const dialog={open:false,classList:{add(){},remove(){}},addEventListener(k,f){listeners[k]=f;},querySelector:k=>nodes[k]||null};
 const openDialog=(title,body)=>{html=title+body;dialog.open=true;const textarea={value:'',addEventListener(k,f){this[k]=f;}},form={dataset:{userId:body.match(/data-user-id="([^"]+)"/)[1]},querySelector:()=>textarea};nodes={'#friend-chat-form':form,textarea,fieldset:{disabled:false},'.chat-status':{textContent:''},'.chat-history':{innerHTML:'',scrollHeight:100,scrollTop:0,clientHeight:100},'[data-action="chat-older"]':{hidden:false}};};
 const ui=friendChatUI({getState:()=>state,api,openDialog,dialog,esc,time:v=>v});
 return {ui,dialog,node:k=>nodes[k],html:()=>html,close:()=>{dialog.open=false;listeners.close();},account:id=>{state={...state,user:{id}};},type:text=>{nodes.textarea.value=text;nodes.textarea.input({target:nodes.textarea});}};
}
const page=(entries=[],before=null)=>({friend:{name:'小<伙伴>'},entries,before});
test('聊天文本只按文字展示，草稿重开保留，切换账号后清空',async()=>{
 const f=fixture(async route=>route.startsWith('friends/chat')?page([message(1,'<img src=x onerror=alert(1)>\n你好')]):{ok:true});
 await f.ui.open('b');assert.match(f.node('.chat-history').innerHTML,/&lt;img/);assert.doesNotMatch(f.node('.chat-history').innerHTML,/<img/);assert.match(f.html(),/小&lt;伙伴&gt;/);
 f.type('尚未发送');f.close();await f.ui.open('b');assert.match(f.html(),/尚未发送/);f.close();f.account('c');await f.ui.open('b');assert.doesNotMatch(f.html(),/尚未发送/);
});
test('发送与轮询交错时仍取回中间消息，不用发送响应跳过游标',async()=>{
 let release,reads=0;const seen=[],f=fixture(async(route,body)=>{
  if(route==='friends/read')return {ok:true};if(route==='friends/message')return {message:message(3,body.body,'a')};
  seen.push(route);if(!route.includes('&after='))return page([message(1,'第一条')]);
  if(++reads===1)return new Promise(r=>{release=()=>r(page([message(2,'中间来信')]));});
  return page([message(3,'发出的信','a')]);
 });
 await f.ui.open('b');const poll=f.ui.poll();f.type('发出的信');const form=f.node('#friend-chat-form');form.dataset.key='old';form.dataset.body='old';const send=f.ui.send(form,{body:'发出的信'},'key');release();await Promise.all([poll,send]);
 assert.deepEqual(seen.slice(-2),['friends/chat?user_id=b&after=1','friends/chat?user_id=b&after=2']);assert.match(f.node('.chat-history').innerHTML,/中间来信/);assert.match(f.node('.chat-history').innerHTML,/发出的信/);assert.equal(f.node('textarea').value,'');assert.equal(form.dataset.key,undefined);
});
test('断网保留草稿，移除好友后禁用输入并停止轮询',async()=>{
 let blocked=false,sends=0,polls=0;const f=fixture(async route=>{
  if(route==='friends/read')return {ok:true};if(route==='friends/message'){sends++;throw Error('断网');}
  polls++;if(blocked)throw Object.assign(Error('先成为好友'),{status:403});return page();
 });await f.ui.open('b');f.type('不要丢');await assert.rejects(f.ui.send(f.node('#friend-chat-form'),{body:'不要丢'},'k'),/断网/);assert.equal(f.node('textarea').value,'不要丢');assert.equal(sends,1);
 blocked=true;await assert.rejects(f.ui.poll());assert.equal(f.node('fieldset').disabled,true);const before=polls;await f.ui.poll();assert.equal(polls,before);
});
test('离开聊天后，晚到的旧消息不会写入另一个好友的窗口',async()=>{
 let release;const f=fixture(async route=>{
  if(route==='friends/read')return {ok:true};if(route.includes('user_id=b&after='))return new Promise(r=>{release=()=>r(page([message(2,'旧好友消息')]));});
  return page();
 });await f.ui.open('b');const pending=f.ui.poll();f.close();await f.ui.open('c');release();await pending;assert.doesNotMatch(f.node('.chat-history').innerHTML,/旧好友消息/);assert.equal(f.node('#friend-chat-form').dataset.userId,'c');
});
