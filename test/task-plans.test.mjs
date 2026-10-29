import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {migrate} from '../lib/migrate.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {dayStart} from '../lib/progress.mjs';
import {nextTaskDay,taskTypeLabel} from '../public/task-types.js';
const plus=(day,n)=>dayAt(dayStart(day)+n*86400000);
function setup(t){const s=new Store(':memory:');t.after(()=>s.db.close());const a=s.newUser({username:'student',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'伙伴',password:''}),other=s.newUser({username:'other',name:'另一位',password:''}),room=s.pair(a.id,g.id).space_id;
 const task=(body={})=>s.createTasks(a,{space_id:room,tasks:[{title:'一项计划',task_kind:'normal',...body}]}).ids[0];
 const complete=(id,body={})=>s.complete(a,{space_id:room,task_id:id,done:true,...body});
 return {s,a,g,other,room,task,complete,day:dayAt()};}

test('长期奖励可自填1000币并独立于普通日上限，撤销及发奖人定分正确冲正',t=>{
 const {s,a,g,room,task,complete}=setup(t),long=task({task_kind:'long',points:1000}),normal=task();
 assert.equal(complete(long).awarded,1000*COIN);assert.equal(complete(normal).awarded,20*COIN);
 s.progress.taskScore(g,{space_id:room,task_id:long,points:2000,expectedRevision:0});assert.equal(s.balance(room),2020*COIN);
 complete(long,{done:false});assert.equal(s.balance(room),20*COIN);assert.equal(complete(long,{points:9999}).awarded,2000*COIN);
 assert.throws(()=>s.progress.taskScore(a,{space_id:room,task_id:long,points:9999,expectedRevision:1}),/发奖人/);
});
test('长期保留且只奖励一次；跨日已完成目标可查看但不能重复领奖',t=>{
 const {s,room,task,complete,day}=setup(t),id=task({task_kind:'long',points:1000});
 assert.equal(s.todayTasks(room,plus(day,30)).some(t=>t.id===id&&!t.done),true);
 complete(id);const later=s.todayTasks(room,plus(day,1)).find(t=>t.id===id);assert.equal(later.done,1);assert.equal(later.completion_day,day);assert.equal(later.daily_due,false);
 t.mock.method(Date,'now',()=>dayStart(plus(day,1))+3600000);assert.throws(()=>complete(id),/已经完成/);assert.equal(s.balance(room),1000*COIN);
});
test('普通任务不能伪装为长期高分，长奖励整数和日期边界受校验',t=>{
 const {s,task,complete,day}=setup(t),normal=task();assert.equal(complete(normal,{task_kind:'long',points:1000}).awarded,20*COIN);
 for(const points of [0,-1,1.2,1000001,Infinity])assert.throws(()=>task({task_kind:'long',points}));
 for(const repeat_days of [0,3,'2',99])assert.throws(()=>task({task_kind:'repeat',repeat_days}));
 assert.throws(()=>task({task_kind:'long',deadline:plus(day,-1)}));assert.throws(()=>task({task_kind:'long',deadline:'2027-02-30'}));
 assert.equal(s.all('SELECT * FROM tasks').length,1);
});
test('重复任务按开始日锚定，支持每日、隔日和每周，非计划日不可打卡或计时',t=>{
 const {s,a,room,task,complete,day}=setup(t),every=task({task_kind:'repeat',repeat_days:2}),weekly=task({task_kind:'repeat',repeat_days:7});
 complete(every);assert.ok(!s.todayTasks(room,plus(day,1)).some(t=>t.id===every));assert.ok(s.todayTasks(room,plus(day,2)).some(t=>t.id===every&&!t.done));
 assert.ok(!s.todayTasks(room,plus(day,6)).some(t=>t.id===weekly));assert.ok(s.todayTasks(room,plus(day,7)).some(t=>t.id===weekly));
 const future=s.plans.future(room,plus(day,1));assert.equal(future.find(t=>t.id===every).next_date,plus(day,2));
 t.mock.method(Date,'now',()=>dayStart(plus(day,1))+3600000);assert.throws(()=>complete(every),/计划日/);assert.throws(()=>s.progress.timer(a,{space_id:room,task_id:weekly,action:'start'}),/计划日/);
});
test('无截止日的长期目标不阻碍日常全勤，有截止日只在当天计入',t=>{
 const {s,room,task,complete,day}=setup(t);task({task_kind:'long',deadline:plus(day,1),points:1000});task({task_kind:'long'});const daily=task({task_kind:'repeat'});complete(daily);
 assert.equal(s.dailyBonus(room).eligible,true);assert.equal(s.dailyBonus(room).total,1);assert.equal(s.dailyBonus(room,plus(day,1)).total,2);assert.equal(s.dailyBonus(room,plus(day,2)).total,1);
});
test('日扣分按当天净完成收益计算，不按余额或重复完成流水计算，花掉仍记账且不扣经验',t=>{
 const {s,room,task,complete,day}=setup(t),long=task({task_kind:'long',points:1000}),normal=task();task();task({task_kind:'repeat',repeat_days:2});task({task_kind:'long',deadline:day});
 complete(long);complete(normal);complete(normal,{done:false});complete(normal);s.post(room,-1020*COIN,'shop','测试消费','test');
 const p=s.plans.preview(room,day);assert.equal(p.gross,1020*COIN);assert.equal(p.missed.length,3);assert.equal(p.amount,30.6*COIN);
 s.plans.settle(room,dayStart(plus(day,1)));s.plans.settle(room,dayStart(plus(day,1))+1000);
 assert.equal(s.balance(room),-30.6*COIN);assert.equal(s.pets.state(room).xp,1020);assert.equal(s.get("SELECT COUNT(*) n FROM ledger WHERE kind='daily_penalty'").n,1);assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='task.daily.settlement'").n,1);
});
test('零收益不扣历史余额，最多扣当日收益100%，普通漏项继续保留',t=>{
 const {s,a,room,task,complete,day}=setup(t);s.post(room,1000*COIN,'demo','历史余额','test');
 for(let group=0;group<3;group++)s.createTasks(a,{space_id:room,tasks:Array.from({length:40},()=>({title:'待办',task_kind:'normal'}))});
 assert.equal(s.plans.preview(room,day).amount,0);const done=task();complete(done);const p=s.plans.preview(room,day);assert.equal(p.percent,100);assert.equal(p.amount,20*COIN);s.plans.settle(room,dayStart(plus(day,1)));assert.equal(s.balance(room),1000*COIN);assert.equal(s.todayTasks(room,plus(day,1)).length,120);
});
test('归档不抹掉当天已安排的责任，但次日不再计入；系统停机后补结算不重复',t=>{
 const {s,a,room,task,complete,day}=setup(t),id=task();complete(task());s.archive(a,{space_id:room,task_id:id});
 assert.equal(s.plans.preview(room,day).missed.length,1);assert.equal(s.plans.preview(room,plus(day,1)).missed.length,0);
 s.plans.settle(room,dayStart(plus(day,4)));assert.equal(s.get('SELECT COUNT(*) n FROM task_settlements').n,4);assert.equal(s.balance(room),19.8*COIN);
 s.plans.settle(room,dayStart(plus(day,4)));assert.equal(s.balance(room),19.8*COIN);
});
test('结算不追溯规则启用日前，未来任务和已提前完成的长期目标不误扣',t=>{
 const {s,room,task,complete,day}=setup(t);const long=task({task_kind:'long',deadline:plus(day,1)});complete(long);task({start_date:plus(day,3)});
 assert.equal(s.plans.preview(room,plus(day,1)).missed.length,0);s.plans.settle(room,dayStart(day));assert.equal(s.get('SELECT COUNT(*) n FROM task_settlements').n,0);
 s.plans.settle(room,dayStart(plus(day,2)));assert.equal(s.get('SELECT MIN(day) day FROM task_settlements').day,day);
});
test('结算失败整笔回滚，恢复后只记一次，不让半笔账残留',t=>{
 const {s,room,task,complete,day}=setup(t);complete(task());task();s.db.exec("CREATE TRIGGER fail_penalty BEFORE INSERT ON ledger WHEN NEW.kind='daily_penalty' BEGIN SELECT RAISE(ABORT,'test failure'); END");
 assert.throws(()=>s.plans.settle(room,dayStart(plus(day,1))));assert.equal(s.get('SELECT COUNT(*) n FROM task_settlements').n,0);assert.equal(s.balance(room),20*COIN);
 s.db.exec('DROP TRIGGER fail_penalty');s.plans.settle(room,dayStart(plus(day,1)));assert.equal(s.balance(room),19.8*COIN);
});
test('不同小屋分别结算，日报包含可核对的扣分且不影响旁人',t=>{
 const {s,a,g,other,room,task,complete,day}=setup(t);complete(task());task();const otherRoom=s.pair(a.id,other.id).space_id;s.post(otherRoom,99*COIN,'test','另一个小屋','test');
 s.plans.settle(room,dayStart(plus(day,1)));s.progress.report(room,day,dayStart(plus(day,1)));assert.equal(s.balance(otherRoom),99*COIN);
 const mails=s.community.inbox(a).entries;assert.match(mails[0].payload.text,/扣 1%（0.2 币）/);assert.match(s.community.inbox(g).entries[0].payload.text,/经验不扣减/);assert.equal(s.community.inbox(other).entries.length,0);
 assert.throws(()=>s.state(other,room),/开放/);
});
test('家庭成员共用奖池但扣分各算各的，普通成员不能更改别人任务分数',t=>{
 const {s,a,g,day}=setup(t),ra=s.community.createFamily(a,{name:'认真小家'}).space_id,invite=s.community.familyInvite(a,{space_id:ra}),rb=s.acceptInvite(g,invite.code).space_id;
 const add=(user,space,kind='normal')=>s.createTasks(user,{space_id:space,tasks:[{title:'一起成长',task_kind:kind,points:1000}]}).ids[0];
 const ta=add(a,ra,'long'),tb=add(g,rb);add(a,ra);add(a,ra);add(g,rb);
 s.complete(a,{space_id:ra,task_id:ta,done:true});s.complete(g,{space_id:rb,task_id:tb,done:true});
 for(const room of [ra,rb])s.plans.settle(room,dayStart(plus(day,1)));
 assert.equal(s.balance(ra),980*COIN);assert.equal(s.balance(rb),19.8*COIN);assert.equal(s.pets.state(ra).xp,1000);assert.equal(s.pets.state(rb).xp,20);
 assert.equal(s.get('SELECT missed FROM task_settlements WHERE space_id=?',ra).missed,2);assert.equal(s.get('SELECT missed FROM task_settlements WHERE space_id=?',rb).missed,1);
 assert.throws(()=>s.progress.taskScore(g,{space_id:ra,task_id:ta,points:2000,expectedRevision:0}),/发奖人/);
 assert.equal(s.community.logs(g,{space_id:rb}).entries.filter(e=>e.action==='task.daily.settlement').length,2);
});
test('旧任务类型推断与周期标签保持兼容',()=>{assert.equal(taskTypeLabel({recurrence:'daily'}),'每天');assert.equal(nextTaskDay({task_kind:'repeat',repeat_days:7,start_date:'2026-01-30'},'2026-02-01'),'2026-02-06');});
test('v12旧库迁移保留任务、分数、账本与完成记录，旧每日模板正确转换',t=>{
 const {s,task,complete,room}=setup(t),daily=task({task_kind:'repeat'}),normal=task();complete(daily);
 const ledger=s.all('SELECT * FROM ledger'),completions=s.all('SELECT * FROM completions');
 s.db.exec("DROP TABLE task_settlements; ALTER TABLE tasks DROP COLUMN task_kind; ALTER TABLE tasks DROP COLUMN repeat_days; ALTER TABLE tasks DROP COLUMN deadline; ALTER TABLE tasks DROP COLUMN archived_at; DELETE FROM settings WHERE key='task_settlement_start'; PRAGMA user_version=12;");
 migrate(s.db);migrate(s.db);assert.equal(s.get('PRAGMA user_version').user_version,20);assert.equal(s.get('SELECT task_kind FROM tasks WHERE id=?',daily).task_kind,'repeat');assert.equal(s.get('SELECT task_kind FROM tasks WHERE id=?',normal).task_kind,'normal');assert.deepEqual(s.all('SELECT * FROM ledger'),ledger);assert.deepEqual(s.all('SELECT * FROM completions'),completions);assert.equal(s.get('SELECT COUNT(*) n FROM task_settlements').n,0);assert.equal(s.balance(room),20*COIN);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});
