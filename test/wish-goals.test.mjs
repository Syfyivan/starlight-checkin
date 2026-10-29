import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {CATEGORIES,DEFAULT_RATES,TEMPLATES} from '../lib/rewards.mjs';
import {migrate} from '../lib/migrate.mjs';
import {createApp} from '../server.mjs';

function fixture(t,s=new Store(':memory:')){
  t.after(()=>s.db.close());
  const a=s.newUser({username:'wishlearner',name:'小芽',password:''}),g=s.newUser({username:'wishgiver',name:'晴天',password:''}),other=s.newUser({username:'wishother',name:'另一个伙伴',password:''});
  const room=s.pair(a.id,g.id).space_id;a.space_id=room;
  const op=(u,method,body={},key=randomUUID())=>{body={space_id:room,...body};return s.operation(u,key,method,body,()=>s[method](u,body));};
  const prize=(extra={})=>op(g,'savePrize',{title:'一份旅行基金',description:'出发的交通补贴',emoji:'🧭',category:'travel',face_cents:1000,cost:60,stock:3,wait_days:0,active:true,...extra}).id;
  return {s,a,g,other,room,op,prize};
}

test('新增探索模板只在选定后上架，旧规则补默认比例但不改变价格、库存和已发卡',t=>{
  const {s,a,g,room,op,prize}=fixture(t),pid=prize({cost:17,stock:2}),card=s.issue(a,s.get('SELECT * FROM prizes WHERE id=?',pid),'test');
  const settings=s.settings(room);settings.rates={study:6,sport:9,healthy:10,essentials:11,beauty:16,food:21,play:25,universal:20,custom:10};
  s.run('INSERT INTO room_settings VALUES(?,?)',room,JSON.stringify(settings));
  const oldPrize=s.get('SELECT * FROM prizes WHERE id=?',pid),oldCard=s.get('SELECT * FROM cards WHERE id=?',card.id);
  assert.deepEqual(CATEGORIES.filter(c=>['travel','craft','experience'].includes(c.id)).map(c=>[c.id,c.rate]),[['travel',12],['craft',10],['experience',12]]);
  assert.equal(s.settings(room).rates.study,6);assert.equal(s.settings(room).rates.travel,12);assert.equal(s.settings(room).rates.craft,10);assert.equal(s.settings(room).rates.experience,12);
  migrate(s.db);assert.equal(s.state(a).prizes.length,1);assert.deepEqual(s.get('SELECT * FROM prizes WHERE id=?',pid),oldPrize);assert.deepEqual(s.get('SELECT * FROM cards WHERE id=?',card.id),oldCard);
  const templates=TEMPLATES.slice(44);assert.equal(templates.length,16);assert.equal(new Set(TEMPLATES.map(p=>p.template_id)).size,TEMPLATES.length);
  op(g,'addTemplates',{templates:templates.map(p=>p.template_id)});
  for(const template of templates){const p=s.get('SELECT * FROM prizes WHERE template_id=?',template.template_id);assert.equal(p.cost,(template.face_cents?Math.ceil(template.face_cents*DEFAULT_RATES[template.category]/100):template.cost)*COIN);assert.equal(p.stock,1);assert.equal(p.channel,'shop');}
  assert.deepEqual(s.get('SELECT * FROM prizes WHERE id=?',pid),oldPrize);assert.deepEqual(s.get('SELECT * FROM cards WHERE id=?',card.id),oldCard);
  op(g,'addTemplates',{templates:templates.map(p=>p.template_id)});assert.equal(s.all('SELECT id FROM prizes').length,17);
});

test('零额度体验保留明确售价，可以兑换、申请体验和核销，不要求人民币凭证',t=>{
  const {s,a,g,room,op}=fixture(t);op(g,'addTemplates',{templates:['experience-museum','travel-halfday']});
  const p=s.get("SELECT * FROM prizes WHERE template_id='experience-museum'");assert.equal(p.face_cents,0);assert.equal(p.cost,80*COIN);
  s.post(room,400*COIN,'test','测试','fixture');const card=op(a,'buy',{prize_id:p.id}).card;
  const request=op(a,'redeem',{card_id:card.id,receipt_note:'约好周六去博物馆'});
  op(g,'fulfill',{card_id:card.id,token:request.token,expectedVersion:1,note:'今天一起参观完成'});
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'fulfilled');assert.equal(s.get('SELECT paid_cents FROM cards WHERE id=?',card.id).paid_cents,0);
  assert.equal(s.balance(room),320*COIN);assert.throws(()=>op(g,'savePrize',{...p,space_id:room,cost:0,use_rate:true}),/售价/);
});

test('新金额品类支持万能转换与合成，不能把金额卡命名成一次性的零额度体验',t=>{
  const {s,a,g,room,op}=fixture(t);op(g,'addTemplates',{templates:['wish-34','travel-10']});
  const wildcard=s.get("SELECT * FROM prizes WHERE template_id='wish-34'");
  const converted=['travel','craft','experience'].map(category=>{
    const card=s.issue(a,wildcard,'test'),body={space_id:room,card_ids:[card.id],category,face_cents:500};
    const result=s.operation(a,randomUUID(),'/api/cards/convert',body,()=>s.moveCards(a,body,'convert'));
    assert.equal(result.card.category,category);assert.equal(result.card.face_cents,500);assert.ok(!TEMPLATES.some(t=>t.face_cents===0&&t.title===result.card.title));return result.card;
  });
  const travel=s.issue(a,s.get("SELECT * FROM prizes WHERE template_id='travel-10'"),'test'),body={space_id:room,card_ids:[converted[0].id,travel.id]};
  const merged=s.operation(a,randomUUID(),'/api/cards/merge',body,()=>s.moveCards(a,body,'merge'));
  assert.equal(merged.card.category,'travel');assert.equal(merged.card.face_cents,1700);assert.ok(!TEMPLATES.some(t=>t.face_cents===0&&t.title===merged.card.title));
});

test('领奖人按小屋保存目标，发奖人可读不可代设，其他小屋与家庭共同奖品不能作为目标',t=>{
  const {s,a,g,other,room,op,prize}=fixture(t),pid=prize(),foreign=s.pair(other.id,g.id).space_id;
  const foreignPrize=s.savePrize(g,{...s.get('SELECT * FROM prizes WHERE id=?',pid),id:undefined,space_id:foreign,cost:60}).id;
  assert.throws(()=>op(g,'setWishGoal',{prize_id:pid}),/领奖人/);assert.throws(()=>op(other,'setWishGoal',{prize_id:pid}),/没有向你开放/);
  assert.throws(()=>op(a,'setWishGoal',{prize_id:foreignPrize}),/当前小屋/);
  const key=randomUUID();op(a,'setWishGoal',{prize_id:pid},key);op(a,'setWishGoal',{prize_id:pid},key);
  assert.equal(s.state(a,room).wishGoal.prize_id,pid);assert.equal(s.state(g,room).wishGoal.prize_id,pid);assert.equal(s.state(a,s.personalSpaceId(a.id)).wishGoal,null);
  assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/wishes/goal'").n,1);
  assert.equal(s.balance(room),0);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,3);assert.equal(s.all('SELECT * FROM cards').length,0);
  const lottery=prize({channel:'lottery',weight:1});assert.throws(()=>op(a,'setWishGoal',{prize_id:lottery}),/当前小屋/);
  s.run("UPDATE prizes SET reward_scope='shared' WHERE id=?",pid);assert.throws(()=>op(a,'setWishGoal',{prize_id:pid}),/当前小屋/);
  assert.equal(s.state(a).wishGoal.available,false);op(a,'setWishGoal',{prize_id:null});assert.equal(s.state(a).wishGoal,null);
});

test('目标差额随任务打卡、撤销和价格变化实时计算，购买成功才清除且不预留库存',t=>{
  const {s,a,g,room,op,prize}=fixture(t),pid=prize();op(a,'setWishGoal',{prize_id:pid});
  const task=op(a,'createTasks',{tasks:[{title:'写完作业',recurrence:'daily'}]}).ids[0];
  assert.equal(s.state(a).wishGoal.remaining,60*COIN);op(a,'complete',{task_id:task,done:true});assert.equal(s.state(a).wishGoal.remaining,40*COIN);
  op(a,'complete',{task_id:task,done:false});assert.equal(s.state(a).wishGoal.remaining,60*COIN);
  const p=s.get('SELECT * FROM prizes WHERE id=?',pid);op(g,'savePrize',{...p,space_id:room,cost:40});assert.equal(s.state(a).wishGoal.cost,40*COIN);assert.equal(s.state(a).wishGoal.remaining,40*COIN);
  assert.throws(()=>op(a,'buy',{prize_id:pid}),/不足/);assert.equal(s.state(a).wishGoal.prize_id,pid);
  s.post(room,100*COIN,'test','测试','fixture');assert.equal(s.state(a).wishGoal.remaining,0);
  const key=randomUUID();op(a,'buy',{prize_id:pid},key);op(a,'buy',{prize_id:pid},key);
  assert.equal(s.state(a).wishGoal,null);assert.equal(s.balance(room),60*COIN);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,2);assert.equal(s.all('SELECT * FROM cards').length,1);
});

test('已选目标缺货或下架时保留并提示状态，恢复不加库存，关闭小屋后不能重新选择',t=>{
  const {s,a,g,room,op,prize}=fixture(t),pid=prize();op(a,'setWishGoal',{prize_id:pid});
  s.run('UPDATE prizes SET stock=0 WHERE id=?',pid);assert.equal(s.state(a).wishGoal.available,false);assert.match(s.state(a).wishGoal.reason,/领完/);
  assert.throws(()=>op(a,'setWishGoal',{prize_id:pid}),/当前小屋/);s.run('UPDATE prizes SET stock=2 WHERE id=?',pid);
  op(g,'removePrizes',{ids:[pid]});assert.match(s.state(a).wishGoal.reason,/收起来/);op(g,'restorePrizes',{ids:[pid]});assert.equal(s.state(a).wishGoal.available,true);assert.equal(s.state(a).wishGoal.stock,2);
  s.run("UPDATE spaces SET status='unbound' WHERE id=?",room);assert.equal(s.state(a).wishGoal.available,false);assert.throws(()=>op(a,'setWishGoal',{prize_id:pid}),/已经收起来/);
});

test('未获得或未解锁宠物用品不能设目标，后来锁定时也不会暴露外观',t=>{
  const {s,a,g,room,op}=fixture(t);op(g,'addTemplates',{templates:['pet_snack','pet_crown']});
  const snack=s.get("SELECT * FROM prizes WHERE template_id='pet_snack'"),crown=s.get("SELECT * FROM prizes WHERE template_id='pet_crown'");
  assert.throws(()=>op(a,'setWishGoal',{prize_id:snack.id}),/先在抽奖/);
  s.run('INSERT INTO pets VALUES(?,?,?,?)',room,'nuonuo-seal','',new Date().toISOString());
  assert.throws(()=>op(a,'setWishGoal',{prize_id:crown.id}),/未解锁/);op(a,'setWishGoal',{prize_id:snack.id});
  s.run("UPDATE prizes SET effect='pet_crown',title='不应看见的皇冠' WHERE id=?",snack.id);
  const goal=s.state(a).wishGoal;assert.equal(goal.available,false);assert.equal(goal.hidden,true);assert.equal(goal.title,'待解锁的小心愿');assert.equal(goal.description,'');assert.equal(goal.emoji,'◌');
  const personal=s.personalSpaceId(a.id);s.run('INSERT INTO pets VALUES(?,?,?,?)',personal,'nuonuo-seal','',new Date().toISOString());
  assert.throws(()=>op(a,'setWishGoal',{space_id:personal,prize_id:'personal-pet:pet_snack'}),/个人宠物铺/);
});

test('朋友家庭同一个奖品的个人目标互不覆盖，家长家庭管家不能以领奖人身份设置',t=>{
  const {s,a,g,other}=fixture(t),room=s.tx(()=>s.community.createFamily(a,{name:'朋友一起攒',mode:'friends'})).space_id;
  const invitation=s.tx(()=>s.community.familyInvite(a,{space_id:room})),otherRoom=s.tx(()=>s.acceptInvite(other,invitation.code)).space_id;
  const pid=s.savePrize(a,{space_id:room,title:'旅行小基金',description:'大家各自攒',emoji:'🧭',category:'travel',face_cents:1000,cost:60,stock:3,wait_days:0,active:true}).id;
  s.tx(()=>s.setWishGoal(a,{space_id:room,prize_id:pid}));s.tx(()=>s.setWishGoal(other,{space_id:otherRoom,prize_id:pid}));
  s.post(otherRoom,60*COIN,'test','测试','fixture');s.tx(()=>s.buy(other,{space_id:otherRoom,prize_id:pid}));
  assert.equal(s.state(other,otherRoom).wishGoal,null);assert.equal(s.state(a,room).wishGoal.prize_id,pid);assert.equal(s.state(other,room).wishGoal,null);
  const parentRoom=s.tx(()=>s.community.createFamily(g,{name:'家长发奖',mode:'guardian'})).space_id;
  assert.throws(()=>s.tx(()=>s.setWishGoal(g,{space_id:parentRoom,prize_id:null})),/管家/);
});

test('v20 升级只创建目标表，重启保留已选心愿且不改账本或卡片',t=>{
  const dir=mkdtempSync(join(tmpdir(),'starlight-wish-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');
  let s=new Store(path);const a=s.newUser({username:'persistent',name:'小芽',password:''}),g=s.newUser({username:'persistgiver',name:'晴天',password:''}),room=s.pair(a.id,g.id).space_id;a.space_id=room;
  s.addTemplates(g,{space_id:room,templates:['wish-18']});const p=s.get('SELECT * FROM prizes');s.post(room,20*COIN,'test','测试','fixture');const ledger=s.all('SELECT * FROM ledger');
  s.db.exec('DROP TABLE wish_goals;PRAGMA user_version=20');s.db.close();s=new Store(path);assert.equal(s.get('PRAGMA user_version').user_version,23);assert.deepEqual(s.all('SELECT * FROM ledger'),ledger);assert.deepEqual(s.get('SELECT * FROM prizes'),p);
  s.setWishGoal(a,{space_id:room,prize_id:p.id});s.db.close();s=new Store(path);try{migrate(s.db);assert.equal(s.state(a,room).wishGoal.prize_id,p.id);assert.equal(s.state(a,room).wishGoal.remaining,5*COIN);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);}finally{s.db.close();}
});

test('真实 HTTP 心愿接口保留授权、CSRF 与幂等行为，重复请求不重复记日志',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
  const a=s.newUser({username:'httpwish',name:'小芽',password:''}),g=s.newUser({username:'httpgiver',name:'晴天',password:''}),room=s.pair(a.id,g.id).space_id;
  s.addTemplates(g,{space_id:room,templates:['travel-10']});const p=s.get('SELECT * FROM prizes'),session=s.session(a.id),giver=s.session(g.id),origin='http://127.0.0.1:'+server.address().port;
  const call=(session,body,key=randomUUID(),csrf=session.csrf)=>fetch(origin+'/api/wishes/goal',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'starlight_session='+session.token,'X-CSRF-Token':csrf,'Idempotency-Key':key},body:JSON.stringify({space_id:room,...body})});
  assert.equal((await call(session,{prize_id:p.id},randomUUID(),'wrong')).status,403);assert.equal((await call(giver,{prize_id:p.id})).status,403);
  const key=randomUUID(),responses=await Promise.all([call(session,{prize_id:p.id},key),call(session,{prize_id:p.id},key)]);assert.ok(responses.every(r=>r.status===200));
  assert.equal((await responses[0].json()).wishGoal.prize_id,p.id);assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/wishes/goal'").n,1);
  assert.equal((await call(session,{prize_id:null},key)).status,409);assert.equal((await call(session,{prize_id:null})).status,200);assert.equal(s.wishGoal(room),null);
});
