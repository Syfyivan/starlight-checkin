import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {dayStart} from '../lib/progress.mjs';
import {migrate} from '../lib/migrate.mjs';
import {createApp} from '../server.mjs';

function setup(t,mode='friends'){
 const s=new Store(':memory:');t.after(()=>s.db.close());const users=Array.from({length:5},(_,i)=>s.newUser({username:'family_'+i,name:'伙伴'+i,password:''}));
 const [a,b,c,d,out]=users,room=s.tx(()=>s.community.createFamily(a,{name:'一起进步',mode})).space_id;
 const rooms=[room];for(const u of [b,c,d]){const inv=s.tx(()=>s.community.familyInvite(a,{space_id:room}));rooms.push(s.tx(()=>s.acceptInvite(u,inv.code)).space_id);}
 const op=(u,route,body,fn,key=randomUUID())=>s.operation(u,key,route,body,()=>fn(body));
 const plan=(mode='each',extra={})=>op(a,'/api/family/plans',{space_id:room,mode,user_ids:[a.id,b.id],task:{title:'共同读书',task_kind:'normal',...extra}},body=>s.familyPlay.create(a,body)).id;
 const complete=(u,p,done=true,key=randomUUID())=>{const task=s.get('SELECT * FROM tasks WHERE family_plan_id=? AND user_id=?',p,u.id),body={space_id:task.space_id,task_id:task.id,done,note:'读了第一章'};return op(u,'/api/complete',body,b=>s.complete(u,b),key);};
 const prize=(scope='shared')=>s.tx(()=>s.savePrize(a,{space_id:room,title:'一起吃顿好的',description:'一起吃饭凭记录报销',emoji:'🍜',category:'food',face_cents:500,cost:20,stock:1,wait_days:0,active:true,reward_scope:scope})).id;
 return {s,a,b,c,d,out,room,rooms,op,plan,complete,prize};
}
test('各自完成只有全员完成才加共享金币，个人币独立且撤销与重试不刷币',t=>{
 const {s,a,b,room,rooms,plan,complete}=setup(t),p=plan(),fid=s.community.family(a,room).id;
 complete(a,p);assert.equal(s.familyPlay.balance(fid),0);assert.equal(s.balance(room),20*COIN);assert.equal(s.balance(rooms[1]),0);
 const key=randomUUID();complete(b,p,true,key);complete(b,p,true,key);assert.equal(s.familyPlay.balance(fid),20*COIN);assert.equal(s.balance(rooms[1]),20*COIN);
 complete(a,p,false);assert.equal(s.familyPlay.balance(fid),0);assert.equal(s.balance(rooms[1]),20*COIN);complete(a,p);assert.equal(s.familyPlay.balance(fid),20*COIN);
 assert.equal(s.state(b,rooms[1]).familyPlay.plans[0].awarded,true);assert.equal(s.state(b,rooms[1]).familyPlay.plans[0].tasks.length,2);
});
test('一起完成任意参与者确认即可，非参与者不能代领，撤销同时冲正所有奖励',t=>{
 const {s,a,b,c,room,rooms,plan,complete}=setup(t),p=plan('together'),fid=s.community.family(a,room).id;
 complete(b,p);assert.equal(s.familyPlay.balance(fid),20*COIN);assert.equal(s.balance(room),20*COIN);assert.equal(s.balance(rooms[1]),20*COIN);assert.equal(s.ticketBalance(room),1);
 assert.ok(s.get('SELECT note FROM completions WHERE user_id=?',a.id).note.includes(b.name));
 const task=s.get('SELECT * FROM tasks WHERE family_plan_id=?',p);assert.throws(()=>s.tx(()=>s.complete(c,{space_id:rooms[2],task_id:task.id,done:true})),/不存在/);
 complete(a,p);assert.equal(s.familyPlay.balance(fid),20*COIN);complete(a,p,false);assert.equal(s.familyPlay.balance(fid),0);assert.equal(s.balance(room),0);assert.equal(s.balance(rooms[1]),0);assert.equal(s.ticketBalance(room),0);
 assert.ok(s.community.logs(b,{space_id:room}).entries.some(e=>e.action==='family.plan.together'&&e.actor_id===b.id));
});
test('共享兑换扣共享币和共享库存，个人抽奖、掉落、合成不能绕过，共同卡可核销',t=>{
 const {s,a,b,c,room,rooms,plan,complete,prize}=setup(t),p=plan('together'),pid=prize(),fid=s.community.family(a,room).id;complete(a,p);
 assert.equal(s.state(a,room).prizes.length,0);assert.equal(s.lottery.dropPool(room).length,0);assert.throws(()=>s.tx(()=>s.buy(a,{space_id:room,prize_id:pid})),/共享/);assert.throws(()=>s.tx(()=>s.lottery.copy(a,{space_id:room,prize_id:pid,stock:1})),/共同/);
 const card=s.tx(()=>s.familyPlay.buy(b,{space_id:rooms[1],prize_id:pid,expectedCost:20*COIN})).card;assert.equal(s.familyPlay.balance(fid),0);assert.equal(s.balance(rooms[1]),20*COIN);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,0);
 assert.throws(()=>s.tx(()=>s.familyPlay.buy(a,{space_id:room,prize_id:pid,expectedCost:20*COIN})),/暂时/);assert.equal(s.state(b,rooms[1]).cards.length,0);assert.equal(s.state(c,rooms[2]).familyPlay.cards[0].id,card.id);
 assert.throws(()=>s.tx(()=>s.moveCards(b,{space_id:rooms[1],card_ids:[card.id],category:'study',face_cents:100},'convert')),/只能使用/);
 complete(a,p,false);assert.equal(s.familyPlay.balance(fid),-20*COIN);assert.throws(()=>s.tx(()=>s.redeem(b,{space_id:rooms[1],card_id:card.id,claim_cents:500,receipt_note:'一起吃了饭'})),/待补/);complete(b,p);
 s.tx(()=>s.redeem(b,{space_id:rooms[1],card_id:card.id,claim_cents:500,receipt_note:'一起吃了饭'}));assert.throws(()=>s.tx(()=>s.fulfill(c,{card_id:card.id,paid_cents:500,note:'完成',expectedVersion:1})),/管家/);
 s.tx(()=>s.fulfill(a,{card_id:card.id,paid_cents:500,note:'完成报销',expectedVersion:1}));assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'fulfilled');assert.ok(!JSON.stringify(s.state(c,rooms[2]).familyPlay).includes('一起吃了饭'));
});
test('四人家长家庭由一至两位管家发奖，管家不能给自己赚币或兑奖，孩子可独立领奖',t=>{
 const {s,a,b,c,room,rooms,prize}=setup(t,'guardian');s.tx(()=>s.community.setAdmins(a,{space_id:room,user_ids:[a.id,b.id],expected_admins:[a.id]}));
 assert.equal(s.state(a,room).space.canParticipate,false);assert.equal(s.state(c,rooms[2]).space.canParticipate,true);assert.throws(()=>s.createTasks(a,{space_id:room,tasks:[{title:'家长自己刷币',task_kind:'normal'}]}),/家长发奖/);
 const pid=prize('individual');assert.equal(s.state(c,rooms[2]).prizes[0].id,pid);assert.throws(()=>s.savePrize(c,{space_id:rooms[2]}),/管家/);
 const task=s.tx(()=>s.createTasks(c,{space_id:rooms[2],tasks:[{title:'完成作业',task_kind:'normal'}]})).ids[0];s.tx(()=>s.complete(c,{space_id:rooms[2],task_id:task,done:true}));const card=s.tx(()=>s.buy(c,{space_id:rooms[2],prize_id:pid})).card;assert.equal(card.user_id,c.id);
 assert.throws(()=>s.buy(b,{space_id:rooms[1],prize_id:pid}),/家长发奖/);assert.throws(()=>prize('shared'),/朋友家庭/);assert.equal(s.state(a,room).familyPlay,null);
});
test('家庭形式仅创建人可切换，旧家庭不自动迁移，共同资产未处理不能换走',t=>{
 const {s,a,b,out,room,plan}=setup(t,'classic');assert.equal(s.state(a,room).family.mode,'classic');const mode=next=>s.tx(()=>s.familyPlay.mode(a,{space_id:room,expected_mode:s.state(a,room).family.mode,mode:next}));
 assert.throws(()=>s.familyPlay.mode(b,{space_id:room,mode:'friends',expected_mode:'classic'}),/创建人/);assert.throws(()=>s.state(out,room),/没有向你开放/);
 mode('friends');const p=plan();assert.throws(()=>mode('guardian'),/共同计划/);s.tx(()=>s.familyPlay.archive(a,{space_id:room,plan_id:p}));mode('guardian');assert.equal(s.state(a,room).family.mode,'guardian');
});
test('共同计划不能拆开改日期；重复任务每天发一份共同加奖，奖励快照不受新设置影响',t=>{
 const {s,a,b,room,plan,complete}=setup(t),p=plan('each',{task_kind:'repeat',repeat_days:1}),fid=s.state(a,room).family.id,task=s.get('SELECT * FROM tasks WHERE family_plan_id=?',p);
 assert.throws(()=>s.plans.edit(task.user_id===a.id?a:b,{space_id:task.space_id,task_id:task.id}),/共同计划/);assert.throws(()=>s.archive(task.user_id===a.id?a:b,{space_id:task.space_id,task_id:task.id}),/共同计划/);
 complete(a,p);complete(b,p);s.tx(()=>s.saveSettings(a,{...s.settings(room),space_id:room,sharedBonusCoins:99}));
 const tomorrow=dayStart(dayAt())+86400000+3600000;t.mock.method(Date,'now',()=>tomorrow);complete(a,p);complete(b,p);assert.equal(s.familyPlay.balance(fid),40*COIN);assert.equal(s.get('SELECT COUNT(*) n FROM family_plan_rewards').n,2);
});
test('共同确认任何一步失败会回滚，不留下半份奖励或共享加奖',t=>{
 const {s,a,room,plan,complete}=setup(t),p=plan('together'),fid=s.state(a,room).family.id;s.db.exec("CREATE TRIGGER fail_shared BEFORE INSERT ON family_ledger BEGIN SELECT RAISE(ABORT,'test failure');END;");
 assert.throws(()=>complete(a,p),/test failure/);assert.equal(s.get('SELECT COUNT(*) n FROM completions').n,0);assert.equal(s.balance(room),0);assert.equal(s.familyPlay.balance(fid),0);
});
test('扣分开关从今日生效；次日可退回，重复退款及旧脚本退款均不重发',t=>{
 const {s,a,b,room,rooms}=setup(t),sid=rooms[1],day=dayAt();const tasks=s.createTasks(b,{space_id:sid,tasks:[{title:'完成项',task_kind:'normal'},{title:'遗漏项',task_kind:'normal'}]}).ids;s.complete(b,{space_id:sid,task_id:tasks[0],done:true});
 assert.equal(s.plans.preview(sid,day).amount,.2*COIN);s.tx(()=>s.saveSettings(a,{...s.settings(room),space_id:room,penaltyEnabled:false}));assert.equal(s.plans.preview(sid,day).amount,0);s.tx(()=>s.saveSettings(a,{...s.settings(room),space_id:room,penaltyEnabled:true}));
 t.mock.method(Date,'now',()=>dayStart(day)+86400000+3600000);s.tx(()=>s.saveSettings(a,{...s.settings(room),space_id:room,penaltyEnabled:false}));assert.equal(s.get('SELECT amount FROM task_settlements WHERE space_id=? AND day=?',sid,day).amount,.2*COIN);
 assert.throws(()=>s.tx(()=>s.plans.refund(b,{space_id:sid,day})),/管家/);const xp=s.pets.state(sid).xp;s.tx(()=>s.plans.refund(a,{space_id:sid,day}));s.tx(()=>s.plans.refund(a,{space_id:sid,day}));assert.equal(s.balance(sid),20*COIN);assert.equal(s.pets.state(sid).xp,xp);assert.equal(s.get("SELECT COUNT(*) n FROM ledger WHERE kind='penalty_refund'").n,1);assert.equal(s.plans.penalties(a,room)[0].refunded,1);
 const mail=s.get("SELECT COUNT(*) n FROM mailbox WHERE subject='扣掉的学习币回来啦'").n;assert.equal(mail,1);
});
test('商城多选复制和默认模板部分加入，不重置库存和已有中奖率；跨屋整批回滚',t=>{
 const {s,a,room,prize}=setup(t),p1=prize('individual'),p2=prize('individual');
 const result=s.tx(()=>s.lottery.copy(a,{space_id:room,prize_ids:[p1,p2],stock:2}));assert.equal(result.ids.length,2);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',p1).stock,1);
 assert.throws(()=>s.tx(()=>s.lottery.copy(a,{space_id:room,prize_ids:[p1,'outside'],stock:2})));assert.equal(s.get("SELECT COUNT(*) n FROM prizes WHERE channel='lottery'").n,2);
 s.tx(()=>s.saveOdds(a,{space_id:room,version:s.oddsConfig(room).version,entries:result.ids.map(id=>({id,bps:1000}))}));s.tx(()=>s.lottery.defaults(a,{space_id:room,version:s.oddsConfig(room).version,templates:['lucky-1'],replace:false}));assert.equal(s.get("SELECT weight FROM prizes WHERE template_id='lucky-1'").weight,0);assert.equal(s.get('SELECT weight FROM prizes WHERE id=?',result.ids[0]).weight,1000);
 s.tx(()=>s.lottery.defaults(a,{space_id:room,version:s.oddsConfig(room).version,templates:['lucky-6'],replace:true}));assert.equal(s.pool(room).length,2);assert.equal(s.pool(room)[1].probability,.001);assert.equal(s.get("SELECT COUNT(*) n FROM prizes WHERE channel='shop' AND removed=0").n,2);
});
test('v17迁移保留家庭和奖品原字段，新增默认不改变旧模式和账本',t=>{
 const {s,a,room,prize}=setup(t,'classic');prize('individual');const before={families:s.all('SELECT id,name,creator_id,pool_space_id,status,created FROM families'),prizes:s.all('SELECT id,cost,stock,weight,active,removed FROM prizes'),ledger:s.all('SELECT * FROM ledger')};
 s.db.exec('DROP INDEX task_family_plan;ALTER TABLE tasks DROP COLUMN family_plan_id;DROP TABLE family_plan_rewards;DROP TABLE family_plans;DROP TABLE family_ledger;ALTER TABLE families DROP COLUMN mode;ALTER TABLE prizes DROP COLUMN reward_scope;ALTER TABLE cards DROP COLUMN shared_family_id;PRAGMA user_version=17');migrate(s.db);migrate(s.db);
 assert.deepEqual(s.all('SELECT id,name,creator_id,pool_space_id,status,created FROM families'),before.families);assert.deepEqual(s.all('SELECT id,cost,stock,weight,active,removed FROM prizes'),before.prizes);assert.deepEqual(s.all('SELECT * FROM ledger'),before.ledger);assert.equal(s.state(a,room).family.mode,'classic');assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});
test('HTTP 共同计划鉴权、幂等及共享库存并发，不泄露到家庭外',async t=>{
 const {server,store:s}=await createApp({dbPath:':memory:',allowInsecure:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));const base='http://127.0.0.1:'+server.address().port;
 const a=s.newUser({username:'alpha',name:'A',password:''}),b=s.newUser({username:'beta',name:'B',password:''}),out=s.newUser({username:'outsider',name:'C',password:''}),sa=s.session(a.id),sb=s.session(b.id),so=s.session(out.id);
 const call=async(session,path,body,key=randomUUID())=>{const r=await fetch(base+'/api/'+path,{method:'POST',headers:{Origin:base,cookie:'starlight_session='+session.token,'content-type':'application/json','x-csrf-token':session.csrf,'idempotency-key':key},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const room=s.community.createFamily(a,{name:'HTTP family',mode:'friends'}).space_id,invite=s.community.familyInvite(a,{space_id:room});s.tx(()=>s.acceptInvite(b,invite.code));
 const unauthorized=await fetch(base+'/api/family/plans',{method:'POST',headers:{Origin:base,'content-type':'application/json'},body:'{}'});assert.equal(unauthorized.status,401);
 const r=await call(sa,'family/plans',{space_id:room,mode:'together',user_ids:[a.id,b.id],task:{title:'HTTP共同任务',task_kind:'normal'}});assert.equal(r.status,200,JSON.stringify(r.body));
 const task=s.get('SELECT * FROM tasks WHERE family_plan_id=? AND user_id=?',r.body.id,b.id),body={space_id:task.space_id,task_id:task.id,done:true},key=randomUUID();const completed=await Promise.all([call(sb,'complete',body,key),call(sb,'complete',body,key)]);assert.ok(completed.every(r=>r.status===200));assert.equal(s.familyPlay.balance(s.state(a,room).family.id),20*COIN);
 const foreign=await call(so,'family/plans',{space_id:room,mode:'together',user_ids:[a.id,out.id],task:{title:'不能查看',task_kind:'normal'}});assert.equal(foreign.status,403);
 const prize=s.savePrize(a,{space_id:room,title:'一起分享',description:'家庭共同奖励',emoji:'🍜',category:'food',face_cents:500,cost:20,stock:1,wait_days:0,active:true,reward_scope:'shared'}).id;
 const buys=await Promise.all([call(sa,'family/buy',{space_id:room,prize_id:prize,expectedCost:20*COIN}),call(sb,'family/buy',{space_id:task.space_id,prize_id:prize,expectedCost:20*COIN})]);assert.deepEqual(buys.map(r=>r.status).sort(),[200,409]);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',prize).stock,0);assert.equal(s.get('SELECT COUNT(*) n FROM cards WHERE shared_family_id IS NOT NULL').n,1);
});

test('旧脚本已退回的扣分被识别，新的退回入口不会再加币或重复通知',t=>{
 const {s,a,b,room,rooms}=setup(t),space=rooms[1],day=dayAt(),ids=s.createTasks(b,{space_id:space,tasks:[{title:'完成',task_kind:'normal'},{title:'未完成',task_kind:'normal'}]}).ids;s.complete(b,{space_id:space,task_id:ids[0],done:true});
 t.mock.method(Date,'now',()=>dayStart(day)+86400000+3600000);s.plans.settle(space);const debit=s.get("SELECT * FROM ledger WHERE space_id=? AND kind='daily_penalty'",space);
 s.post(space,-debit.amount,'penalty_refund','旧脚本已经退回','penalty-refund:'+debit.id);const balance=s.balance(space),mail=s.all('SELECT * FROM mailbox');assert.equal(s.plans.penalties(a,room)[0].refunded,1);
 assert.equal(s.tx(()=>s.plans.refund(a,{space_id:space,day})).alreadyRefunded,true);assert.equal(s.balance(space),balance);assert.deepEqual(s.all('SELECT * FROM mailbox'),mail);
});
test('一起完成拒绝过去日期，共同记录保留确认人，关闭和切模式不能藏起欠款',t=>{
 const {s,a,b,room,rooms,plan,complete,prize}=setup(t),p=plan('together'),task=s.get('SELECT * FROM tasks WHERE family_plan_id=? AND user_id=?',p,a.id);
 assert.throws(()=>s.tx(()=>s.complete(a,{space_id:room,task_id:task.id,done:true,day:'2000-01-01'})),/今天/);complete(b,p);const state=s.state(a,room);assert.ok(state.familyPlay.plans[0].tasks.every(t=>t.completion.note.includes(b.name)));
 const pid=prize();s.tx(()=>s.familyPlay.buy(a,{space_id:room,prize_id:pid,expectedCost:20*COIN}));complete(b,p,false);s.tx(()=>s.familyPlay.archive(a,{space_id:room,plan_id:p}));assert.throws(()=>s.tx(()=>s.familyPlay.mode(a,{space_id:room,expected_mode:'friends',mode:'guardian'})),/共同计划/);
 assert.equal(s.familyPlay.balance(state.family.id),-20*COIN);assert.equal(s.balance(rooms[1]),0);
});
test('切成家长后仍可兑现旧报销卡，有欠款的旧卡不被强行冻结',t=>{
 const {s,a,b,room,prize}=setup(t,'classic'),pid=prize('individual');s.post(room,20*COIN,'test','fixture','fixture');const c=s.tx(()=>s.buy(a,{space_id:room,prize_id:pid})).card;
 s.post(room,-COIN,'test','fixture debt','fixture');assert.throws(()=>s.tx(()=>s.familyPlay.mode(a,{space_id:room,expected_mode:'classic',mode:'guardian'})),/待补余额/);s.post(room,COIN,'test','fixture restore','fixture');
 s.tx(()=>s.familyPlay.mode(a,{space_id:room,expected_mode:'classic',mode:'guardian'}));assert.ok(s.tx(()=>s.redeem(a,{space_id:room,card_id:c.id,claim_cents:500,receipt_note:'旧卡报销'})).token);assert.throws(()=>s.tx(()=>s.buy(a,{space_id:room,prize_id:pid})),/家长发奖/);
});
