import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {dayAt} from '../lib/common.mjs';
import {dayStart} from '../lib/progress.mjs';
import {createApp} from '../server.mjs';

const HOUR=3600000,DAY=24*HOUR;
function setup(t){
  const s=new Store(':memory:');t.after(()=>s.db.close());
  const [learner,giver,otherGiver,outsider]=['learner','giver','othergiver','outsider'].map(username=>s.newUser({username,name:username==='learner'?'小芽':username,password:''}));
  const room=s.pair(learner.id,giver.id).space_id,otherRoom=s.pair(learner.id,otherGiver.id).space_id;
  const task=(space=room,user=learner,title='背十个单词')=>s.createTasks(user,{space_id:space,tasks:[{title,category:'学习',recurrence:'daily'}]}).ids[0];
  const session=(taskId,start,end,space=room,user=learner)=>{
    const id=randomUUID();s.run('INSERT INTO task_timers VALUES(?,?,?,?,?,?)',id,taskId,space,user.id,start,end);return id;
  };
  return {s,learner,giver,otherGiver,outsider,room,otherRoom,task,session};
}

test('时间轴对本屋领奖人与发奖人开放，个人和其他配对小屋保持隔离',t=>{
  const {s,learner,giver,otherGiver,outsider,room,otherRoom,task,session}=setup(t),day=dayAt(),start=dayStart(day),at=start+12*HOUR;
  const first=task(),second=task(otherRoom),personal=task(s.personalSpaceId(learner.id));
  session(first,start+HOUR,start+2*HOUR);session(second,start+3*HOUR,start+4*HOUR,otherRoom);session(personal,start+5*HOUR,start+6*HOUR,s.personalSpaceId(learner.id));
  for(const user of [learner,giver]){
    const result=s.progress.timeline(user,{space_id:room,day},at);
    assert.deepEqual(result.owner,{id:learner.id,name:'小芽'});assert.equal(result.timeZone,'Asia/Shanghai');assert.equal(result.dayStart,start);assert.equal(result.dayEnd,start+DAY);assert.equal(result.serverNow,at);
    assert.deepEqual(result.sessions.map(s=>s.task_id),[first]);assert.equal(result.total_ms,HOUR);assert.equal(result.task_count,1);
  }
  for(const user of [otherGiver,outsider])assert.throws(()=>s.progress.timeline(user,{space_id:room,day},at),e=>e.status===403);
  assert.throws(()=>s.progress.timeline(giver,{space_id:otherRoom,day},at),e=>e.status===403);
  assert.deepEqual(s.progress.timeline(learner,{},at).sessions.map(s=>s.task_id),[personal]);
});

test('家庭成员可查看彼此时间轴，屋外好友或其他家庭成员不能越权',t=>{
  const {s,learner,giver,otherGiver,outsider,task,session}=setup(t),day=dayAt(),start=dayStart(day),at=start+12*HOUR;
  const family=s.community.createFamily(giver,{name:'一起成长'}).space_id;
  const join=user=>s.tx(()=>s.acceptInvite(user,s.community.familyInvite(giver,{space_id:family}).code)).space_id;
  const learnerRoom=join(learner);join(otherGiver);s.community.createFamily(outsider,{name:'另一家'});
  const tid=task(learnerRoom);session(tid,start+HOUR,start+2*HOUR,learnerRoom);
  for(const user of [learner,giver,otherGiver])assert.equal(s.progress.timeline(user,{space_id:learnerRoom,day},at).sessions[0].task_id,tid);
  assert.throws(()=>s.progress.timeline(outsider,{space_id:learnerRoom,day},at),e=>e.status===403);
});

test('开始、暂停、继续保留独立时间段，时间顺序和总时长正确且不加分',t=>{
  const {s,learner,room,task}=setup(t),day=dayAt(),start=dayStart(day)+8*HOUR,tid=task(),body={space_id:room,task_id:tid};
  s.progress.timer(learner,{...body,action:'start'},start);s.progress.timer(learner,{...body,action:'pause'},start+15*60000);
  s.progress.timer(learner,{...body,action:'start'},start+30*60000);s.progress.timer(learner,{...body,action:'pause'},start+50*60000);
  const result=s.progress.timeline(learner,{space_id:room,day},start+HOUR);
  assert.equal(result.sessions.length,2);assert.notEqual(result.sessions[0].id,result.sessions[1].id);
  assert.deepEqual(result.sessions.map(s=>[s.started_ms,s.ended_ms,s.duration_ms,s.running,s.continuedBefore,s.continuedAfter]),[
    [start,start+15*60000,15*60000,false,false,false],[start+30*60000,start+50*60000,20*60000,false,false,false]
  ]);assert.equal(result.total_ms,35*60000);assert.equal(result.task_count,1);assert.equal(s.balance(room),0);
});

test('跨午夜计时按中国时区分日，恰好落在零点的结束和开始不会重复',t=>{
  const {s,learner,room,task,session}=setup(t),day='2026-10-29',from=dayStart(day),midnight=from+DAY,at=midnight+3*HOUR,tid=task();
  const across=session(tid,midnight-30*60000,midnight+30*60000);
  session(tid,from-30*60000,from);session(tid,midnight+HOUR,midnight+2*HOUR);
  const first=s.progress.timeline(learner,{space_id:room,day},at),next=s.progress.timeline(learner,{space_id:room,day:'2026-10-30'},at);
  assert.equal(first.sessions.length,1);assert.deepEqual(first.sessions[0],{id:across,task_id:tid,title:'背十个单词',category:'学习',started_ms:midnight-30*60000,ended_ms:midnight,duration_ms:30*60000,running:false,continuedBefore:false,continuedAfter:true});
  assert.equal(next.sessions.length,2);assert.equal(next.sessions[0].started_ms,midnight);assert.equal(next.sessions[0].duration_ms,30*60000);assert.equal(next.sessions[0].continuedBefore,true);assert.equal(next.sessions[0].continuedAfter,false);
  assert.equal(first.total_ms+next.total_ms,2*HOUR);
});

test('运行中区间随服务器时间增长，旧日不显示正在计时且超过四小时只裁剪不写库',t=>{
  const {s,learner,room,task,session}=setup(t),day='2026-10-29',from=dayStart(day),midnight=from+DAY,tid=task(),start=midnight-HOUR;
  const id=session(tid,start,null),at=midnight+HOUR;
  const yesterday=s.progress.timeline(learner,{space_id:room,day},at),today=s.progress.timeline(learner,{space_id:room,day:'2026-10-30'},at);
  assert.equal(yesterday.sessions[0].running,false);assert.equal(yesterday.sessions[0].continuedAfter,true);
  assert.equal(today.sessions[0].running,true);assert.equal(today.sessions[0].ended_ms,at);assert.equal(today.sessions[0].duration_ms,HOUR);
  const capped=s.progress.timeline(learner,{space_id:room,day:'2026-10-30'},start+5*HOUR);
  assert.equal(capped.sessions[0].ended_ms,start+4*HOUR);assert.equal(capped.sessions[0].duration_ms,3*HOUR);assert.equal(capped.sessions[0].running,false);
  assert.equal(s.get('SELECT ended_ms FROM task_timers WHERE id=?',id).ended_ms,null);
  assert.equal(s.progress.timeline(learner,{space_id:room,day:'2026-10-31'},at).sessions.length,0);
});

test('归档保留历史，零时长和未来时间段不展示，结束记录同样受当前时间与上限裁剪',t=>{
  const {s,learner,room,task,session}=setup(t),day=dayAt(),from=dayStart(day),at=from+12*HOUR,tid=task();
  session(tid,from+HOUR,from+2*HOUR);session(tid,from+3*HOUR,from+3*HOUR);session(tid,at+HOUR,at+2*HOUR);
  session(tid,from+4*HOUR,from+10*HOUR);session(tid,at-HOUR,at+HOUR);s.archive(learner,{space_id:room,task_id:tid});
  const result=s.progress.timeline(learner,{space_id:room,day},at);
  assert.equal(result.sessions.length,3);assert.equal(result.total_ms,6*HOUR);assert.equal(result.task_count,1);assert.ok(result.sessions.every(s=>!s.running&&s.ended_ms<=at&&s.duration_ms<=4*HOUR));
});

test('只接受真实年月日，查询不结算扣分、不发信、不更改计时与账本',t=>{
  const {s,learner,room,task,session}=setup(t),day='2024-02-29',from=dayStart(day),tid=task();session(tid,from+HOUR,null);
  const before=s.db.prepare('SELECT total_changes() count').get().count;
  assert.equal(s.progress.timeline(learner,{space_id:room,day},from+3*HOUR).sessions.length,1);
  for(const invalid of ['','2023-02-29','2024-02-30','2026-04-31','2026-13-01','2026-00-01','2026-01-00','2026-1-01','1999-12-31','2101-01-01','2026-10-29T00:00:00Z',123,{},[]]){
    assert.throws(()=>s.progress.timeline(learner,{space_id:room,day:invalid},from+DAY),e=>e.status===400);
  }
  for(const valid of ['2000-01-01','2100-12-31'])assert.equal(s.progress.timeline(learner,{space_id:room,day:valid},from+DAY).day,valid);
  assert.equal(s.db.prepare('SELECT total_changes() count').get().count,before);assert.equal(s.balance(room),0);
});

test('HTTP 时间轴需登录且隔离小屋，双方可读取，日期校验与静态资源正常',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(()=>{s.db.close();resolve();})));
  const [learner,giver,outsider]=['learner','giver','outsider'].map(username=>s.newUser({username,name:username,password:''}));
  const room=s.pair(learner.id,giver.id).space_id,otherRoom=s.pair(learner.id,outsider.id).space_id;
  const task=s.createTasks(learner,{space_id:room,tasks:[{title:'写作文',category:'学习',recurrence:'daily'}]}).ids[0];
  const at=Date.now(),day=dayAt(at-DAY),from=dayStart(day),timer=randomUUID();
  s.run('INSERT INTO task_timers VALUES(?,?,?,?,?,?)',timer,task,room,learner.id,from+9*HOUR,from+10*HOUR);
  const sessions=[learner,giver,outsider].map(user=>s.session(user.id)),base='http://127.0.0.1:'+server.address().port;
  const get=(session,query={space_id:room,day})=>fetch(base+'/api/tasks/timeline?'+new URLSearchParams(query),session?{headers:{Cookie:'starlight_session='+session.token}}:{});
  const before=s.db.prepare('SELECT total_changes() count').get().count;
  const anonymous=await get();assert.equal(anonymous.status,401);assert.match((await anonymous.json()).error,/登录/);
  assert.equal((await get({token:'invalid-session'})).status,401);
  for(const session of sessions.slice(0,2)){
    const response=await get(session),result=await response.json();assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-type'),/application\/json/);
    assert.deepEqual(result.owner,{id:learner.id,name:learner.name});assert.equal(result.day,day);assert.equal(result.total_ms,HOUR);
    assert.equal(result.sessions[0].id,timer);assert.equal(result.sessions[0].title,'写作文');assert.equal(result.sessions[0].running,false);
  }
  const rejected=await get(sessions[2]);assert.equal(rejected.status,403);assert.ok(!(await rejected.text()).includes('写作文'));
  assert.equal((await get(sessions[1],{space_id:otherRoom,day})).status,403);
  assert.equal((await get(sessions[0],{space_id:room,day:'2026-02-30'})).status,400);
  assert.equal((await get(sessions[0],{space_id:room})).status,200);
  assert.equal(s.db.prepare('SELECT total_changes() count').get().count,before);
  for(const [file,mime,content] of [['timeline.js','text/javascript','timelineUI'],['timeline.css','text/css','.timeline-panel']]){
    const response=await fetch(base+'/'+file);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(mime));assert.ok((await response.text()).includes(content));
  }
});
