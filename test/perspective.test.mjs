import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomPerspective,roomNavigation,canUseRewards,renameCardOffer} from '../public/rooms.js';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {COIN} from '../lib/common.mjs';

const pair=(isSelf=false,admin=true)=>({user:{id:'me'},space:{id:'pair',isSelf,canFulfill:admin,status:'active'},admin:admin?{}:null});

test('双人发奖小屋默认管理，领奖和个人计划仍默认计划，不借用账号全局角色',()=>{
  assert.equal(roomPerspective(pair()),'manage');
  assert.equal(roomPerspective(pair(true,false)),'receive');
  assert.equal(roomPerspective({...pair(true,false),user:{id:'me',role:'admin'}}),'receive');
  assert.equal(roomPerspective({...pair(true,false),space:{id:'personal',isSelf:true,personal:true}}),'receive');
  assert.equal(roomPerspective({...pair(),space:{...pair().space,status:'deleted'}}),'manage');
});

test('家庭管家也能领奖，只有主动进入管理或预览才切换视角',()=>{
  const family={...pair(true),family:{id:'family',mySpace:'pair'}};
  assert.equal(roomPerspective(family),'receive');
  assert.equal(roomPerspective(family,'manage'),'manage');
  assert.equal(roomPerspective(family,'preview'),'preview');
  assert.equal(canUseRewards(family,'receive'),true);
  assert.equal(canUseRewards(family,'manage'),false);
  assert.equal(canUseRewards(family,'preview'),false);
});

test('预览不能用币、用卡或打卡，非发奖人不能进入管理或预览',()=>{
  assert.equal(roomPerspective(pair(),'preview'),'preview');
  assert.equal(roomPerspective(pair(),'receive'),'manage');
  assert.equal(canUseRewards(pair(),'preview'),false);
  assert.equal(roomPerspective(pair(true,false),'manage'),'receive');
  assert.equal(roomPerspective(pair(true,false),'preview'),'receive');
  assert.equal(canUseRewards({...pair(true,false),space:{isSelf:true,status:'deleted'}},'receive'),false);
});

test('管理导航直达配置与核销；预览卡包明确身份，家庭管家正常入口不消失',()=>{
  const manage=roomNavigation(pair(),'manage');
  assert.deepEqual(manage.map(n=>n.tab||n.page),['prizes','odds','redemptions','today','timeline','reading','settings']);
  assert.ok(!manage.some(n=>['cards','lucky'].includes(n.page)));
  assert.equal(roomNavigation(pair(),'preview').find(n=>n.page==='cards').label,'卡包预览');
  assert.equal(roomNavigation(pair(true,false),'receive').find(n=>n.page==='cards').label,'我的卡包');
  const closed={...pair(),space:{...pair().space,status:'deleted'}};
  assert.ok(!roomNavigation(closed,'manage').some(n=>['prizes','odds','settings'].includes(n.tab)));
});

test('改名卡提示覆盖已上架、下架、售罄、已移除，不因同名普通卡误判',()=>{
  const p={id:'rename',effect:'room_rename',active:1,stock:3};
  assert.equal(renameCardOffer({prizes:[{title:'小屋改名卡'}],removedPrizes:[]}).kind,'missing');
  assert.equal(renameCardOffer({prizes:[p],removedPrizes:[]}).kind,'active');
  assert.equal(renameCardOffer({prizes:[{...p,active:0}],removedPrizes:[]}).kind,'inactive');
  assert.equal(renameCardOffer({prizes:[{...p,stock:0}],removedPrizes:[]}).kind,'empty');
  assert.equal(renameCardOffer({prizes:[],removedPrizes:[p]}).kind,'removed');
  assert.equal(renameCardOffer({prizes:[p],removedPrizes:[{...p,id:'old'}]}).prize.id,'rename');
});

test('同一个人跨小屋收发奖时身份隔离；预览读取不扣币，发奖人 API 不能代替伙伴操作',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
  const [a,b,c]=['first','middle','last'].map(username=>s.newUser({username,name:username,password:''}));
  const ab=s.pair(a.id,b.id).space_id,bc=s.pair(b.id,c.id).space_id;
  s.addTemplates(b,{space_id:ab,templates:['room-rename']});
  s.post(ab,100*COIN,'test','test','test');
  const prize=s.get('SELECT * FROM prizes WHERE room_id=?',ab),card=s.issue(a,prize,'test');
  const task=s.createTasks(a,{space_id:ab,tasks:[{title:'读书',recurrence:'daily',difficulty:'standard'}]}).ids[0];
  const base='http://127.0.0.1:'+server.address().port,session=s.session(b.id);
  const headers={Cookie:'starlight_session='+session.token,'X-CSRF-Token':session.csrf,Origin:base,'Content-Type':'application/json'};
  const before={balance:s.balance(ab),stock:s.get('SELECT stock FROM prizes WHERE id=?',prize.id).stock};
  const giving=await(await fetch(base+'/api/state?space='+ab,{headers})).json();
  const receiving=await(await fetch(base+'/api/state?space='+bc,{headers})).json();
  assert.equal(roomPerspective(giving),'manage');assert.equal(roomPerspective(receiving),'receive');
  assert.equal(giving.cards[0].id,card.id);assert.equal(giving.prizes[0].id,prize.id);
  for(const [route,body] of [['buy',{prize_id:prize.id}],['draw',{mode:'coins'}],['complete',{task_id:task,done:true}],['cards/rename-room',{card_id:card.id,name:'不能代改',expected_name:''}]]){
    const r=await fetch(base+'/api/'+route,{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({space_id:ab,...body})});
    assert.equal(r.status,403,route);await r.json();
  }
  assert.deepEqual({balance:s.balance(ab),stock:s.get('SELECT stock FROM prizes WHERE id=?',prize.id).stock},before);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');
  assert.equal(s.get('SELECT COUNT(*) n FROM completions').n,0);
  assert.equal(s.get('SELECT COUNT(*) n FROM draws').n,0);
});
