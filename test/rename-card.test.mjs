import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {migrate} from '../lib/migrate.mjs';
import {createApp} from '../server.mjs';

function fixture(t){
  const s=new Store(':memory:');t.after(()=>s.db.close());
  const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),b=s.newUser({username:'other',name:'小云',password:''});
  const room=s.pair(a.id,g.id).space_id,other=s.pair(a.id,b.id).space_id;
  s.addTemplates(g,{space_id:room,templates:['room-rename']});
  const p=s.get('SELECT * FROM prizes WHERE room_id=?',room);s.post(room,100*COIN,'test','test','test');
  const op=(user,action,body,fn,key=randomUUID())=>s.operation(user,key,action,body,()=>fn(user,body));
  const buy=()=>op(a,'/api/buy',{space_id:room,prize_id:p.id},s.buy.bind(s)).card;
  const rename=(user,body,key)=>op(user,'/api/cards/rename-room',{space_id:room,...body},s.renameRoom.bind(s),key);
  return {s,a,g,b,room,other,p,buy,rename,op};
}

test('兑换改名卡只扣币和库存；使用一次后双方看见新名，重试不重复消耗或记日志',t=>{
  const {s,a,g,room,other,p,buy,rename}=fixture(t),card=buy();
  assert.equal(p.cost,20*COIN);assert.equal(s.balance(room),80*COIN);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',p.id).stock,2);
  assert.equal(card.effect,'room_rename');assert.equal(s.state(g,room).space.roomName,'');
  const key=randomUUID(),body={card_id:card.id,name:'星星补给站',expected_name:''},r=rename(a,body,key);
  assert.deepEqual(rename(a,body,key),r);assert.equal(s.state(g,room).space.roomName,'星星补给站');
  assert.equal(s.state(a,room).rooms.find(r=>r.id===room).room_name,'星星补给站');assert.equal(s.state(a,other).space.roomName,'');
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'used');assert.equal(s.balance(room),80*COIN);
  assert.throws(()=>rename(a,{...body,name:'再用一次',expected_name:'星星补给站'}),/已经用过/);
  const logs=s.all("SELECT * FROM room_audit WHERE action='/api/cards/rename-room'");assert.equal(logs.length,1);assert.equal(JSON.parse(logs[0].detail).name,r.name);assert.equal(JSON.parse(logs[0].detail).oldName,'默认小屋名');
});

test('改名权限只属于持卡领奖人和对应小屋；普通卡不能冒充，功能卡不能报销或合成',t=>{
  const {s,a,g,b,room,other,buy,rename}=fixture(t),card=buy(),body={card_id:card.id,name:'新名字',expected_name:''};
  for(const user of [g,b])assert.throws(()=>rename(user,body));
  assert.throws(()=>rename(a,{...body,space_id:other}),/不在/);
  assert.throws(()=>s.redeem(a,{space_id:room,card_id:card.id}),/功能卡/);
  assert.throws(()=>s.moveCards(a,{space_id:room,card_ids:[card.id]},'convert'),/额度卡/);
  s.addTemplates(g,{space_id:room,templates:['wish-18']});const ordinary=s.issue(a,s.get("SELECT * FROM prizes WHERE template_id='wish-18'"),'test');
  s.run('UPDATE cards SET title=? WHERE id=?','小屋改名卡',ordinary.id);assert.throws(()=>rename(a,{...body,card_id:ordinary.id}),/不是小屋改名卡/);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');
});

test('无效名字、未到日期、待补余额、关闭小屋都不消耗卡片',t=>{
  const {s,a,room,buy,rename}=fixture(t),card=buy(),body={card_id:card.id,name:'新名字',expected_name:''};
  for(const name of ['', ' ', '长'.repeat(25),'名字\n换行','名字\u0000'])assert.throws(()=>rename(a,{...body,name}));
  s.run('UPDATE cards SET available=? WHERE id=?','2099-01-01T00:00:00Z',card.id);assert.throws(()=>rename(a,body),/使用日期/);
  s.run('UPDATE cards SET available=? WHERE id=?','2000-01-01T00:00:00Z',card.id);s.post(room,-81*COIN,'test','test','test');assert.throws(()=>rename(a,body),/待补余额/);
  s.post(room,COIN,'test','test','test');s.run("UPDATE spaces SET status='deleted' WHERE id=?",room);assert.throws(()=>rename(a,body));
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');assert.equal(s.get('SELECT room_name FROM spaces WHERE id=?',room).room_name,'');
});

test('编辑商品不会改变已发卡用途；冲突与同名改名不消耗第二张卡',t=>{
  const {s,a,g,room,p,buy,rename}=fixture(t),card=buy();
  s.savePrize(g,{...p,space_id:room,cost:20,effect:'',title:'普通约定卡'});
  rename(a,{card_id:card.id,name:'晚风小窝',expected_name:''});assert.equal(s.get('SELECT effect FROM cards WHERE id=?',card.id).effect,'room_rename');
  s.savePrize(g,{...p,space_id:room,cost:20});const second=buy();
  assert.throws(()=>rename(a,{card_id:second.id,name:'另一块招牌',expected_name:''}),/刚换了/);
  assert.throws(()=>rename(a,{card_id:second.id,name:'晚风小窝',expected_name:'晚风小窝'}),/已经是/);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',second.id).status,'ready');
  assert.throws(()=>s.savePrize(g,{...p,space_id:room,cost:20,face_cents:100}),/不含报销额度/);
});

test('家庭普通成员能用自己的卡改共享名；另一成员的旧表单冲突，余额和卡包独立',t=>{
  const {s,a,g,b,op}=fixture(t),fa=s.community.createFamily(g,{name:'旧招牌'}).space_id;
  const invite=s.community.familyInvite(g,{space_id:fa}),fb=s.tx(()=>s.acceptInvite(a,invite.code)).space_id;
  s.addTemplates(g,{space_id:fa,templates:['room-rename']});const p=s.get('SELECT * FROM prizes WHERE room_id=?',fa);
  s.post(fb,100*COIN,'test','test','test');s.post(fa,100*COIN,'test','test','test');
  const card=s.buy(a,{space_id:fb,prize_id:p.id}).card,other=s.buy(g,{space_id:fa,prize_id:p.id}).card;
  op(a,'/api/cards/rename-room',{space_id:fb,card_id:card.id,name:'六颗小星星',expected_name:'旧招牌'},s.renameRoom.bind(s));
  assert.equal(s.state(g,fa).family.name,'六颗小星星');assert.equal(s.state(a,fb).space.roomName,'六颗小星星');
  assert.equal(s.state(g,fa).rooms.find(r=>r.id===fa).family_name,'六颗小星星');assert.equal(s.balance(fa),80*COIN);
  assert.throws(()=>op(g,'/api/cards/rename-room',{space_id:fa,card_id:other.id,name:'陈旧改名',expected_name:'旧招牌'},s.renameRoom.bind(s)),/刚换了/);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',other.id).status,'ready');assert.throws(()=>s.state(b,fb));
  assert.ok(s.community.logs(g,{space_id:fa}).entries.some(e=>e.actor_id===a.id&&e.summary.includes('六颗小星星')));
});

test('日志写入失败时改名和卡片消耗一起回滚',t=>{
  const {s,a,room,buy,rename}=fixture(t),card=buy();
  s.db.exec("CREATE TRIGGER test_fail BEFORE INSERT ON room_audit BEGIN SELECT RAISE(ABORT,'test audit unavailable'); END");
  assert.throws(()=>rename(a,{card_id:card.id,name:'不应保存',expected_name:''}),/test audit unavailable/);
  assert.equal(s.get('SELECT room_name FROM spaces WHERE id=?',room).room_name,'');assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');
});

test('改名卡可进入抽奖，固定概率池新增卡为零概率，重复添加不补库存',t=>{
  const {s,a,g,room,p,op}=fixture(t);
  const lp=s.lottery.copy(g,{space_id:room,prize_id:p.id,stock:3});s.saveOdds(g,{space_id:room,version:s.oddsConfig(room).version,entries:[{id:lp.id,bps:10000}]});
  const result=op(a,'/api/draw',{space_id:room,mode:'coins'},(u,b)=>s.draw(u,b,()=>0));
  assert.equal(result.card.effect,'room_rename');assert.equal(result.card.source,'draw');
  s.addTemplates(g,{space_id:room,templates:['room-rename']});assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',lp.id).stock,2);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',p.id).stock,3);
  const family=s.community.createFamily(g,{name:'概率测试'}).space_id;
  s.addTemplates(g,{space_id:family,templates:['wish-18']});const ordinary=s.get('SELECT * FROM prizes WHERE room_id=?',family);
  const ol=s.lottery.copy(g,{space_id:family,prize_id:ordinary.id,stock:1});s.saveOdds(g,{space_id:family,version:s.oddsConfig(family).version,entries:[{id:ol.id,bps:10000}]});
  s.addTemplates(g,{space_id:family,templates:['room-rename']});assert.equal(s.get("SELECT weight FROM prizes WHERE room_id=? AND effect='room_rename'",family).weight,0);
});

test('v7 迁移只增加空用途字段，不把同名旧卡变为功能卡，不补发商品',t=>{
  const {s,g,room,p}=fixture(t);s.run('UPDATE prizes SET effect=? WHERE id=?','',p.id);
  const before=s.all('SELECT id,cost,stock,weight,face_cents FROM prizes');
  s.db.exec('ALTER TABLE spaces DROP COLUMN room_name;ALTER TABLE prizes DROP COLUMN effect;ALTER TABLE cards DROP COLUMN effect;PRAGMA user_version=7');
  migrate(s.db);migrate(s.db);assert.equal(s.get('PRAGMA user_version').user_version,15);assert.deepEqual(s.all('SELECT id,cost,stock,weight,face_cents FROM prizes'),before);
  assert.equal(s.get('SELECT effect FROM prizes WHERE id=?',p.id).effect,'');assert.equal(s.state(g,room).space.roomName,'');assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});

test('HTTP 改名校验登录和 CSRF，重放安全，手机样式可公开加载',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
  const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),room=s.pair(a.id,g.id).space_id;
  s.addTemplates(g,{space_id:room,templates:['room-rename']});const card=s.issue(a,s.get('SELECT * FROM prizes'),'test'),session=s.session(a.id),origin='http://127.0.0.1:'+server.address().port,key=randomUUID();
  const body={space_id:room,card_id:card.id,name:'请求过来的新名字',expected_name:''},call=(auth,csrf)=>fetch(origin+'/api/cards/rename-room',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,...(auth?{Cookie:'starlight_session='+session.token}:{}),...(csrf?{'X-CSRF-Token':session.csrf}:{})},body:JSON.stringify(body)});
  assert.equal((await call(false,false)).status,401);assert.equal((await call(true,false)).status,403);assert.equal((await call(true,true)).status,200);assert.equal((await call(true,true)).status,200);
  assert.equal((await fetch(origin+'/mobile.css')).status,200);assert.equal(s.state(g,room).space.roomName,body.name);
});
