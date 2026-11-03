import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {migrate} from '../lib/migrate.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {missedPenalty,DEFAULT_PENALTIES} from '../lib/task-plans.mjs';
const DAY=86400000,START=Date.parse('2026-11-03T12:00:00+08:00');
function fixture(t){
 let clock=START;t.mock.method(Date,'now',()=>clock);
 const s=new Store(':memory:');t.after(()=>s.db.close());
 const a=s.newUser({username:'penalty_a',name:'小芽',password:''}),g=s.newUser({username:'penalty_g',name:'晴天',password:''}),o=s.newUser({username:'penalty_o',name:'另一位',password:''}),room=s.pair(a.id,g.id).space_id;a.space_id=room;s.run('UPDATE spaces SET created=?',new Date(START).toISOString());
 s.run("UPDATE settings SET value=? WHERE key='daily_penalty_start'",dayAt(START+DAY));
 s.run("UPDATE settings SET value=? WHERE key='task_settlement_start'",dayAt(START));
 const at=n=>{clock=START+n*DAY;},day=n=>dayAt(START+n*DAY);
 const seed=(coins=100,space=room)=>s.post(space,coins*COIN,'test','测试余额',randomUUID());
 const add=(body={})=>s.createTasks(a,{space_id:room,tasks:[{title:'一个小计划',task_kind:'normal',...body}]}).ids[0];
 const done=id=>s.complete(a,{space_id:room,task_id:id,done:true});
 const rules=(body={})=>s.tx(()=>s.saveSettings(g,{...s.settings(room),space_id:room,...body}));
 const row=n=>s.get('SELECT * FROM task_settlements WHERE space_id=? AND day=?',room,day(n));
 return {s,a,g,o,room,at,day,seed,add,done,rules,row};
}
test('没计划和未登录也每日结算，连续未学习5/10/15/20封顶；从更新次日开始且幂等',t=>{
 const f=fixture(t);f.seed();f.at(6);f.s.plans.settle(f.room);
 assert.equal(f.row(0).amount,0);assert.deepEqual([1,2,3,4,5].map(n=>f.row(n).amount/COIN),[5,10,15,20,20]);
 assert.equal(f.s.balance(f.room),30*COIN);assert.equal(JSON.parse(f.row(5).penalty_meta).streak,5);
 const count=f.s.all('SELECT * FROM ledger').length;f.s.plans.settle(f.room);assert.equal(f.s.all('SELECT * FROM ledger').length,count);
 assert.equal(f.s.pets.state(f.room).xp,0);
});
test('完成会重置连续天数；固定扣币和收入比例可切换，和缺席取高不叠加',t=>{
 const f=fixture(t);f.seed();f.at(2);f.s.plans.settle(f.room);const a=f.add();f.add();f.done(a);
 let p=f.s.plans.preview(f.room,f.day(2));assert.equal(p.meta.streak,0);assert.equal(p.amount,2*COIN);
 f.at(3);f.s.plans.settle(f.room);assert.equal(f.row(2).amount,2*COIN);
 p=f.s.plans.preview(f.room,f.day(3));assert.equal(p.meta.streak,1);assert.equal(p.amount,5*COIN);
 const long=f.add({task_kind:'long',points:1000});f.done(long);p=f.s.plans.preview(f.room,f.day(3));assert.equal(p.meta.streak,0);assert.equal(p.amount,2*COIN);
 f.rules({missedTaskMode:'income_percent',missedTaskPercent:1});p=f.s.plans.preview(f.room,f.day(3));assert.equal(p.amount,10*COIN);
 for(let i=0;i<20;i++)f.add();assert.equal(f.s.plans.preview(f.room,f.day(3)).amount,20*COIN);
});

test('三种模式只选一种；梯度只加在后面的项目，收入模式不设固定下限',()=>{
 const tasks=[50,20,30,10,10].map(n=>({points:n*COIN})),r={...DEFAULT_PENALTIES,penaltyDailyCapCoins:100};
 assert.equal(missedPenalty(tasks,100*COIN,r),10*COIN);
 assert.equal(missedPenalty(tasks,100*COIN,{...r,missedTaskGradient:true}),14*COIN);
 assert.equal(missedPenalty(tasks,100*COIN,{...r,missedTaskMode:'task_percent'}),12*COIN);
 const graded={...r,missedTaskMode:'task_percent',missedTaskGradient:true};
 assert.equal(missedPenalty(tasks,100*COIN,graded),14.5*COIN);assert.equal(missedPenalty(tasks.reverse(),100*COIN,graded),14.5*COIN);
 assert.equal(missedPenalty(tasks.slice(0,3),100*COIN,{...r,missedTaskMode:'income_percent'}),6*COIN);
 assert.equal(missedPenalty(tasks.slice(0,1),20*COIN,{...r,missedTaskMode:'income_percent'}),0.4*COIN);
 assert.equal(missedPenalty(tasks,0,{...r,missedTaskMode:'income_percent'}),0);
 assert.equal(missedPenalty(Array(50).fill({points:COIN}),10*COIN,{...r,missedTaskMode:'income_percent',missedTaskPercent:20,missedTaskGradient:true}),10*COIN);
 assert.equal(missedPenalty(tasks,1000*COIN,{...graded,penaltyDailyCapCoins:5}),5*COIN);
 assert.equal(missedPenalty([{points:1000000*COIN}],0,{...graded}),100*COIN);
});

test('任务分值模式采用发奖人定分；修改分数和方式前冻结昨天，退款仍按原扣款',t=>{
 const f=fixture(t);f.seed();f.at(1);f.rules({missedTaskMode:'task_percent',inactivityBaseCoins:0,inactivityStepCoins:0});
 const tid=f.add({difficulty:'hard'}),score=points=>f.s.tx(()=>f.s.progress.taskScore(f.g,{space_id:f.room,task_id:tid,points,expectedRevision:f.s.get('SELECT score_revision FROM tasks WHERE id=?',tid).score_revision}));
 score(50);assert.equal(f.s.plans.preview(f.room,f.day(1)).amount,5*COIN);
 f.at(2);score(10);assert.equal(f.row(1).amount,5*COIN);assert.equal(f.s.plans.preview(f.room,f.day(2)).amount,COIN);
 f.at(3);f.rules({missedTaskMode:'income_percent',missedTaskGradient:true});assert.equal(f.row(2).amount,COIN);
 assert.equal(f.s.plans.preview(f.room,f.day(3)).amount,0);const historical=f.s.plans.preview(f.room,f.day(1));assert.equal(historical.meta.mode,'task_percent');assert.equal(historical.amount,5*COIN);
 f.s.tx(()=>f.s.plans.refund(f.g,{space_id:f.room,day:f.day(1)}));assert.equal(f.s.balance(f.room),99*COIN);
 for(const b of [{missedTaskMode:'hybrid'},{missedTaskGradient:'true'},{missedTaskScorePercent:101},{missedTaskScorePercent:1.5}])assert.throws(()=>f.rules(b));
});

test('任务分值模式变更等级计分前结算昨天，今天按新的等级分值计算',t=>{
 const f=fixture(t);f.seed();f.at(1);f.rules({missedTaskMode:'task_percent',inactivityBaseCoins:0,inactivityStepCoins:0});f.add({difficulty:'standard'});
 f.at(2);f.rules({difficultyPoints:{easy:10,standard:30,hard:40,challenge:50}});
 assert.equal(f.row(1).amount,2*COIN);assert.equal(f.s.plans.preview(f.room,f.day(2)).amount,3*COIN);
});

test('普通任务改为高分长期目标后，当天保留原分值的扣分基数而不会报错或放大',t=>{
 const f=fixture(t);f.seed();f.at(1);f.rules({missedTaskMode:'task_percent',inactivityBaseCoins:0,inactivityStepCoins:0});const tid=f.add(),task=f.s.get('SELECT * FROM tasks WHERE id=?',tid);
 f.s.tx(()=>f.s.plans.edit(f.a,{...task,space_id:f.room,task_id:tid,task_kind:'long',points:1000,deadline:'',expectedVersion:f.s.plans.editVersion(task)}));
 const p=f.s.plans.preview(f.room,f.day(1));assert.equal(p.amount,2*COIN);assert.equal(p.missed[0].points,20*COIN);
 f.at(2);f.s.plans.settle(f.room);assert.equal(f.row(1).amount,2*COIN);assert.equal(f.s.plans.preview(f.room,f.day(2)).amount,0);
});
test('余额只扣到零，负余额不扩大，退回只退实际扣款；无权限与重复退回被保护',t=>{
 const f=fixture(t);f.seed(7);f.at(3);f.s.plans.settle(f.room);assert.equal(f.row(1).amount,5*COIN);assert.equal(f.row(2).amount,2*COIN);assert.equal(f.s.balance(f.room),0);
 assert.equal(JSON.parse(f.row(2).penalty_meta).calculated,10*COIN);
 assert.throws(()=>f.s.plans.refund(f.o,{space_id:f.room,day:f.day(2)}));
 f.s.tx(()=>f.s.plans.refund(f.g,{space_id:f.room,day:f.day(2)}));f.s.tx(()=>f.s.plans.refund(f.g,{space_id:f.room,day:f.day(2)}));assert.equal(f.s.balance(f.room),2*COIN);
 f.s.post(f.room,-5*COIN,'test','已有待补',randomUUID());f.at(4);f.s.plans.settle(f.room);assert.equal(f.row(3).amount,0);assert.equal(f.s.balance(f.room),-3*COIN);
});
test('长任务专注10分钟或阅读笔记算学习，跨午夜只计对应时段，单纯开始计时不算',t=>{
 const f=fixture(t);f.at(1);const id=f.add({task_kind:'long'}),start=Date.parse(f.day(1)+'T23:55:00+08:00');
 f.s.run('INSERT INTO task_timers VALUES(?,?,?,?,?,?)',randomUUID(),id,f.room,f.a.id,start,start+15*60000);
 f.at(2);f.s.plans.settle(f.room);assert.equal(JSON.parse(f.row(1).penalty_meta).learned,false);
 assert.equal(f.s.plans.preview(f.room,f.day(2)).meta.learned,true);
 f.at(3);f.s.plans.settle(f.room);const book=f.s.reading.import(f.a,{space_id:f.room,book:{title:'小书',author:'测试',chapters:[{title:'一章',text:'认真读一段话。'.repeat(50)}]}});
 const bid=book.id||book.book?.id||f.s.get('SELECT id FROM reading_books').id;
 f.s.run('INSERT INTO reading_notes VALUES(?,?,?,?,?,?,?,?)',randomUUID(),f.room,bid,0,'今天读懂了一句话',randomUUID(),0,new Date(Date.now()).toISOString());
 assert.equal(f.s.plans.preview(f.room,f.day(3)).meta.learned,true);
});
test('改设置先按旧规则结算；关闭期间不扣且打断连续天数；再次开启从第一档起算',t=>{
 const f=fixture(t);f.seed();f.at(2);f.rules({inactivityBaseCoins:8,inactivityStepCoins:3,penaltyDailyCapCoins:25,missedTaskMinCoins:1,missedTaskPercent:2});
 assert.equal(f.row(1).amount,5*COIN);assert.equal(f.s.plans.preview(f.room,f.day(2)).amount,11*COIN);
 f.rules({penaltyEnabled:false});f.at(3);f.rules({penaltyEnabled:true});assert.equal(f.row(2).amount,0);assert.equal(f.s.plans.preview(f.room,f.day(3)).amount,8*COIN);
 for(const b of [{inactivityBaseCoins:-1},{missedTaskPercent:21},{penaltyDailyCapCoins:0}])assert.throws(()=>f.rules(b));
 assert.throws(()=>f.s.saveSettings(f.a,{...f.s.settings(f.room),space_id:f.room,inactivityBaseCoins:1}));
});
test('个人空间和家长不扣；家庭领奖人独立结算，新加入首日不扣',t=>{
 const f=fixture(t),personal=f.s.personalSpaceId(f.a.id),family=f.s.tx(()=>f.s.community.createFamily(f.g,{name:'小家',mode:'guardian'})).space_id;
 const inv=f.s.community.familyInvite(f.g,{space_id:family}),child=f.s.tx(()=>f.s.acceptInvite(f.a,inv.code)).space_id;
 for(const sid of [personal,family,child])f.seed(50,sid);
 f.at(2);for(const sid of [personal,family,child])f.s.plans.settle(sid);
 assert.equal(f.s.balance(personal),50*COIN);assert.equal(f.s.balance(family),50*COIN);assert.equal(f.s.balance(child),45*COIN);
 const newRoom=f.s.pair(f.o.id,f.g.id).space_id;f.s.run('UPDATE spaces SET created=? WHERE id=?',new Date(Date.now()).toISOString(),newRoom);f.seed(10,newRoom);assert.equal(f.s.plans.preview(newRoom,f.day(2)).amount,0);
});
test('无任务也有日报说明扣分，只有本人和本屋发奖人收到，退款不增加经验',t=>{
 const f=fixture(t);f.seed();f.at(2);f.s.plans.settle(f.room);f.s.progress.report(f.room,f.day(1));f.s.progress.report(f.room,f.day(1));
 const mine=f.s.community.inbox(f.a).entries,manager=f.s.community.inbox(f.g).entries;assert.equal(mine.length,1);assert.equal(manager.length,1);assert.match(mine[0].payload.text,/连续.*1.*5/);assert.equal(f.s.community.inbox(f.o).entries.length,0);
 f.s.plans.refund(f.g,{space_id:f.room,day:f.day(1)});assert.equal(f.s.pets.state(f.room).xp,0);
});
test('失败回滚账本与结算，v23迁移保留旧扣分并且不重设新规则起始日',t=>{
 const f=fixture(t);f.seed();f.at(2);f.s.db.exec("CREATE TRIGGER fail_daily BEFORE INSERT ON ledger WHEN NEW.kind='daily_penalty' BEGIN SELECT RAISE(ABORT,'test failure'); END");
 assert.throws(()=>f.s.plans.settle(f.room));assert.equal(f.row(1),undefined);assert.equal(f.s.balance(f.room),100*COIN);f.s.db.exec('DROP TRIGGER fail_daily');f.s.plans.settle(f.room);
 const ledger=f.s.all('SELECT * FROM ledger'),starts=f.s.get("SELECT value FROM settings WHERE key='daily_penalty_start'").value;
 f.s.db.exec('ALTER TABLE task_settlements DROP COLUMN penalty_meta;PRAGMA user_version=23');migrate(f.s.db);migrate(f.s.db);
 assert.deepEqual(f.s.all('SELECT * FROM ledger'),ledger);assert.equal(f.s.get("SELECT value FROM settings WHERE key='daily_penalty_start'").value,starts);assert.equal(f.s.get('PRAGMA user_version').user_version,24);assert.deepEqual(f.s.all('PRAGMA foreign_key_check'),[]);
});
test('同日改日期或归档不擦除待完成项；重复任务非计划日及未到期长期目标不算漏做',t=>{
 const f=fixture(t);f.seed();f.at(1);const id=f.add(),repeat=f.add({task_kind:'repeat',repeat_days:2}),long=f.add({task_kind:'long',deadline:f.day(3)});
 f.done(repeat);f.s.tx(()=>f.s.plans.edit(f.a,{space_id:f.room,task_id:id,expectedVersion:f.s.plans.editVersion({id,space_id:f.room}),title:'明天继续',task_kind:'normal',start_date:f.day(2),category:'学习',quadrant:'none',estimated_minutes:0}));
 f.s.archive(f.a,{space_id:f.room,task_id:id});assert.deepEqual(f.s.plans.preview(f.room,f.day(1)).missed.map(t=>t.id),[id]);
 f.at(2);f.s.plans.settle(f.room);const begin=Date.parse(f.day(2)+'T08:00:00+08:00');f.s.run('INSERT INTO task_timers VALUES(?,?,?,?,?,?)',randomUUID(),long,f.room,f.a.id,begin,begin+10*60000);
 const p=f.s.plans.preview(f.room,f.day(2));assert.equal(p.missed.length,0);assert.equal(p.amount,0);assert.equal(p.meta.streak,0);
 f.at(3);f.s.plans.settle(f.room);assert.ok(f.s.plans.preview(f.room,f.day(3)).missed.some(t=>t.id===long));
});
test('关闭小屋不再持续扣款，额度设置为零能单独关闭缺席扣分',t=>{
 const f=fixture(t);f.seed();f.at(1);f.rules({inactivityBaseCoins:0,inactivityStepCoins:0});assert.equal(f.s.plans.preview(f.room,f.day(1)).amount,0);
 f.add();assert.equal(f.s.plans.preview(f.room,f.day(1)).amount,2*COIN);
 f.at(2);f.s.plans.settle(f.room);const balance=f.s.balance(f.room);f.s.run("UPDATE spaces SET status='deleted',closed_at=? WHERE id=?",new Date(Date.now()).toISOString(),f.room);
 f.at(5);f.s.plans.settle(f.room);assert.equal(f.s.balance(f.room),balance);
});
