import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialRoom,receivingRooms,roomMemoryKey} from '../public/rooms.js';
import {createApp} from '../server.mjs';

const room=(id,learner_id='me',giver_id='friend',extra={})=>({id,learner_id,giver_id,status:'active',...extra});
const state=rooms=>({user:{id:'me'},space:{id:'personal'},rooms:[room('personal','me',null),...rooms]});

test('首次只有一间领奖小窝时进入它，多间时留在个人计划由本人选择',()=>{
  assert.equal(initialRoom(state([room('reward')])),'reward');
  assert.equal(initialRoom(state([room('one'),room('two')])),'personal');
  assert.equal(initialRoom(state([])),'personal');
});
test('主动选过个人计划或发奖小窝时记住选择，关闭或陌生小窝不能被记忆选中',()=>{
  const s=state([room('reward'),room('giving','friend','me'),room('closed','me','friend',{status:'deleted'})]);
  assert.equal(initialRoom(s,'personal'),'personal');
  assert.equal(initialRoom(s,'giving'),'giving');
  assert.equal(initialRoom(s,'closed'),'reward');
  assert.equal(initialRoom(s,'unknown'),'reward');
  assert.notEqual(roomMemoryKey('me'),roomMemoryKey('friend'));
});
test('只列自己的领奖小窝和家庭，不把发奖人角色或关闭的小窝当成领奖入口',()=>{
  const s=state([room('giving','friend','me'),room('family','me',null,{family_id:'f'}),room('old','me','friend',{status:'unbound'})]);
  assert.deepEqual(receivingRooms(s).map(r=>r.id),['family']);
  assert.equal(initialRoom(s),'family');
});
test('真实 HTTP：个人计划提供领奖入口，收发两端读取同一奖品，其他小窝不混入',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
  const [learner,giver,other]=['learner','giver','other'].map(username=>s.newUser({username,name:username,password:''}));
  const shared=s.pair(learner.id,giver.id).space_id,foreign=s.pair(other.id,giver.id).space_id;
  s.addTemplates(giver,{space_id:shared,templates:['wish-18','wish-19']});
  s.addTemplates(giver,{space_id:foreign,templates:['wish-1']});
  const origin='http://127.0.0.1:'+server.address().port;
  const read=async(user,path)=>{const session=s.session(user.id),r=await fetch(origin+path,{headers:{Cookie:'starlight_session='+session.token}});return {status:r.status,data:await r.json()};};
  const personal=(await read(learner,'/api/state')).data;
  assert.equal(personal.prizes.length,0);
  assert.deepEqual(personal.rewardRooms.map(r=>[r.id,r.prizeCount]),[[shared,2]]);
  assert.ok(!JSON.stringify(personal).includes(foreign));
  assert.equal(initialRoom(personal),shared);
  const a=(await read(learner,'/api/state?space='+shared)).data,b=(await read(giver,'/api/state?space='+shared)).data;
  assert.deepEqual(a.prizes,b.prizes);assert.deepEqual(a.pool,b.pool);
  assert.equal((await read(other,'/api/state?space='+shared)).status,403);
  assert.equal((await fetch(origin+'/rooms.js')).status,200);
  const session=s.session(learner.id),reply=await fetch(origin+'/api/rooms/close',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'starlight_session='+session.token,'X-CSRF-Token':session.csrf,'Idempotency-Key':randomUUID()},body:JSON.stringify({space_id:shared,mode:'deleted'})});
  assert.equal(reply.status,200);
  assert.equal(s.get('SELECT subject FROM mailbox WHERE recipient_id=?',giver.id).subject,'想和你商量关闭小窝');
});
