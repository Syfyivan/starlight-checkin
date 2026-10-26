import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store,hash} from '../lib/store.mjs';
import {Identity} from '../lib/identity.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {createApp} from '../server.mjs';

function setup(t){
  const s=new Store(':memory:');t.after(()=>s.db.close());const c=s.community,users=Array.from({length:8},(_,i)=>s.newUser({username:'person_'+i,name:'伙伴'+i,password:''}));
  const op=(user,action,b,fn,key=randomUUID())=>s.operation(user,key,action,b,()=>fn(b));
  const call=(user,route,b)=>{const methods={'/api/tasks':'createTasks','/api/complete':'complete','/api/archive':'archive','/api/buy':'buy','/api/redeem':'redeem','/api/admin/fulfill':'fulfill','/api/admin/templates':'addTemplates','/api/admin/prize':'savePrize','/api/admin/settings':'saveSettings','/api/admin/odds':'saveOdds','/api/draw':'draw'};return op(user,route,b,()=>s[methods[route]](user,b));};
  const community=(user,name,b)=>op(user,'/api/community/'+name,b,()=>c[name](user,b));
  const makeFamily=(owner=users[0])=>community(owner,'createFamily',{name:'星星之家'}).space_id;
  const join=(u,room,inviter=users[0])=>{const invite=community(inviter,'familyInvite',{space_id:room});return op(u,'/api/pairs/accept',{code:invite.code},()=>s.acceptInvite(u,invite.code)).space_id;};
  const task=(u,room,title='今天认真读书')=>call(u,'/api/tasks',{space_id:room,tasks:[{title,points:20,recurrence:'daily'}]}).ids[0];
  const friends=(a,b)=>{const m=community(a,'friendRequest',{username:b.username});community(b,'respond',{id:m.id,accept:true});};
  return {s,c,users,op,call,community,makeFamily,join,task,friends};
}

test('家庭共用奖池，但任务、余额、免费机会和卡包各自独立',t=>{
  const {s,c,users:[a,b],makeFamily,join,task,call}=setup(t),ra=makeFamily(),rb=join(b,ra);
  call(a,'/api/admin/templates',{space_id:ra,templates:['wish-18']});const p=s.get('SELECT * FROM prizes WHERE room_id=?',ra);
  const ta=task(a,ra),tb=task(b,rb);call(a,'/api/complete',{space_id:ra,task_id:ta,done:true});call(b,'/api/complete',{space_id:rb,task_id:tb,done:true});
  assert.equal(s.balance(ra),20*COIN);assert.equal(s.balance(rb),20*COIN);assert.equal(s.ticketBalance(ra),1);assert.equal(s.ticketBalance(rb),1);assert.equal(s.balance(a.id),0);
  const state=s.state(b,rb);assert.equal(state.prizes[0].id,p.id);assert.equal(state.family.members.length,2);assert.equal(state.space.personal,false);assert.equal(state.space.isSelf,true);assert.equal(state.space.canManage,false);assert.equal(state.settings.dailyBonusKind,'ticket');
  assert.equal(s.state(b,ra).tasks[0].id,ta);assert.throws(()=>task(b,ra),/领奖人/);assert.throws(()=>call(b,'/api/complete',{space_id:rb,task_id:ta,done:true}),/不存在/);
  s.post(ra,10*COIN,'test','测试','x');const card=call(a,'/api/buy',{space_id:ra,prize_id:p.id}).card;assert.equal(card.space_id,ra);assert.equal(s.state(b,rb).cards.length,0);assert.equal(s.state(b,ra).cards.length,0);assert.equal(s.balance(rb),20*COIN);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',p.id).stock,2);
  call(b,'/api/complete',{space_id:rb,task_id:tb,done:false});assert.equal(s.ticketBalance(rb),0);assert.equal(s.ticketBalance(ra),1);assert.equal(c.logs(a,{space_id:ra}).entries.some(e=>e.actor_id===b.id&&e.summary.includes('撤销完成')),true);
});

test('家庭人数上限六人，旧邀请不能挤进第七人，外人不能看任何成员空间',t=>{
  const {s,c,users,makeFamily,join,community}=setup(t),room=makeFamily(),pending=Array.from({length:6},()=>community(users[0],'familyInvite',{space_id:room}));
  for(let i=1;i<=5;i++)s.tx(()=>s.acceptInvite(users[i],pending[i-1].code));
  assert.equal(c.family(users[0],room).members.length,6);assert.throws(()=>s.tx(()=>s.acceptInvite(users[6],pending[5].code)),/六位/);assert.equal(s.get('SELECT remaining FROM invites WHERE hash=?',hash(pending[5].code)).remaining,1);
  assert.throws(()=>community(users[0],'familyInvite',{space_id:room}),/六位/);assert.throws(()=>s.state(users[6],room),/没有向你开放/);assert.throws(()=>c.logs(users[7],{space_id:room}),/没有向你开放/);assert.throws(()=>join(users[0],room),/六位/);
});

test('1–2 位家庭管家由创建人选定，其他成员不能修改奖品，变更权限立即生效',t=>{
  const {s,c,users:[a,b,d,out],makeFamily,join,community,call}=setup(t),ra=makeFamily(),rb=join(b,ra),rd=join(d,ra);
  const admins=(u,ids,expected=[a.id])=>community(u,'setAdmins',{space_id:ra,user_ids:ids,expected_admins:expected});
  assert.throws(()=>admins(b,[b.id]),/创建人/);assert.throws(()=>admins(a,[]),/1–2/);assert.throws(()=>admins(a,[a.id,b.id,d.id]),/1–2/);assert.throws(()=>admins(a,[out.id]),/成员/);assert.throws(()=>call(b,'/api/admin/templates',{space_id:rb,templates:['wish-18']}),/管家/);
  admins(a,[a.id,b.id]);assert.equal(s.canManage(b,rd),true);call(b,'/api/admin/templates',{space_id:rb,templates:['wish-18']});assert.equal(s.state(d,rd).prizes.length,1);assert.ok(c.overview(d).unread>0);
  assert.throws(()=>admins(a,[d.id]),/变化/);admins(a,[b.id],[a.id,b.id]);assert.equal(s.canManage(a,ra),false);assert.equal(s.canManage(b,ra),true);assert.equal(s.canManage(d,ra),false);
});

test('家庭旧卡由当前管家核销，卸任管家不能再读凭证或核销，管家也能领奖',t=>{
  const {s,c,users:[a,b,d],makeFamily,join,community,call}=setup(t),ra=makeFamily(),rb=join(b,ra),rd=join(d,ra);
  call(a,'/api/admin/templates',{space_id:ra,templates:['wish-18']});const p=s.get('SELECT * FROM prizes');s.post(rb,100*COIN,'test','测试','x');const card=call(b,'/api/buy',{space_id:rb,prize_id:p.id}).card;
  const share=call(b,'/api/redeem',{space_id:rb,card_id:card.id,receipt_note:'私人购买记录',claim_cents:500});assert.throws(()=>s.shareCard(d,share.token),/只有/);assert.ok(!JSON.stringify(s.state(d,rb)).includes('私人购买记录'));
  community(a,'setAdmins',{space_id:ra,user_ids:[b.id],expected_admins:[a.id]});assert.throws(()=>s.shareCard(a,share.token),/只有/);assert.equal(s.shareCard(b,share.token).card.id,card.id);
  assert.equal(s.state(b,rb).admin.redemptions[0].name,b.name);call(b,'/api/admin/fulfill',{space_id:rb,card_id:card.id,expectedVersion:1,note:'按约定报销完成',paid_cents:500});assert.equal(s.get('SELECT fulfilled_by FROM cards WHERE id=?',card.id).fulfilled_by,b.id);
  assert.ok(c.logs(d,{space_id:rd}).entries.some(e=>e.actor_id===b.id&&e.action==='/api/admin/fulfill'));
});

test('家庭两位成员购买同一张仅剩一张的奖品，不会超卖或扣错币',t=>{
  const {s,users:[a,b],makeFamily,join,call}=setup(t),ra=makeFamily(),rb=join(b,ra);
  const p=call(a,'/api/admin/prize',{space_id:ra,title:'一份小心愿',description:'凭记录报销',emoji:'🌼',category:'study',face_cents:500,cost:10,stock:1,weight:10,wait_days:0,active:true}).id;
  s.post(ra,50*COIN,'test','测试','x');s.post(rb,50*COIN,'test','测试','x');call(b,'/api/buy',{space_id:rb,prize_id:p});assert.throws(()=>call(a,'/api/buy',{space_id:ra,prize_id:p}),/领完/);assert.equal(s.balance(ra),50*COIN);assert.equal(s.balance(rb),40*COIN);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',p).stock,0);
});

test('家庭设置和概率共享，免费抽奖及每日上限仍按成员分别计算',t=>{
  const {s,users:[a,b],makeFamily,join,call,task}=setup(t),ra=makeFamily(),rb=join(b,ra);
  call(a,'/api/admin/templates',{space_id:ra,templates:['wish-18']});const p=s.get('SELECT * FROM prizes');call(a,'/api/admin/odds',{space_id:ra,version:s.oddsConfig(ra).version,entries:[{id:p.id,bps:10000}]});
  call(a,'/api/admin/settings',{...s.settings(ra),space_id:ra,dailyCap:20,drawLimit:1});assert.equal(s.settings(rb).dailyCap,20);assert.equal(s.settings(rb).fixedOdds,true);assert.equal(s.pool(rb)[1].probability,1);
  for(const [u,room] of [[a,ra],[b,rb]]){const tid=task(u,room);call(u,'/api/complete',{space_id:room,task_id:tid,done:true});call(u,'/api/draw',{space_id:room,mode:'ticket'});assert.equal(s.ticketBalance(room),0);assert.equal(s.balance(room),20*COIN);}
  assert.equal(s.state(a,ra).cards.length,1);assert.equal(s.state(b,rb).cards.length,1);
});

test('只有新小屋创建人能申请删除，对方同意后关闭，旧卡仍能兑现并能新建关系',t=>{
  const {s,c,users:[a,b,d],community,call}=setup(t),room=s.pair(a.id,b.id,b.id).space_id;
  call(b,'/api/admin/templates',{space_id:room,templates:['wish-18']});const p=s.get('SELECT * FROM prizes');s.post(room,100*COIN,'test','测试','x');const card=call(a,'/api/buy',{space_id:room,prize_id:p.id}).card;
  assert.throws(()=>community(a,'requestClose',{space_id:room,mode:'deleted'}),/创建人/);const req=community(b,'requestClose',{space_id:room,mode:'deleted'});assert.equal(s.state(a,room).space.status,'active');assert.equal(c.overview(a).pending[0].kind,'room_close');
  const mail=c.overview(a).pending[0];assert.throws(()=>community(d,'respond',{id:mail.id,accept:true}),/不属于你/);community(a,'respond',{id:mail.id,accept:true});assert.equal(s.state(a,room).space.status,'deleted');assert.ok(!s.state(a).rooms.some(r=>r.id===room));assert.ok(s.state(a).archivedRooms.some(r=>r.id===room));assert.throws(()=>call(a,'/api/tasks',{space_id:room,tasks:[]}),/收起来/);assert.throws(()=>call(a,'/api/buy',{space_id:room,prize_id:p.id}),/收起来/);assert.throws(()=>call(b,'/api/admin/templates',{space_id:room,templates:['wish-19']}),/发奖人/);
  const share=call(a,'/api/redeem',{space_id:room,card_id:card.id,receipt_note:'旧卡正常报销',claim_cents:500});call(b,'/api/admin/fulfill',{space_id:room,card_id:card.id,token:share.token,expectedVersion:1,paid_cents:500,note:'已报销'});assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'fulfilled');assert.notEqual(s.pair(a.id,b.id,b.id).space_id,room);assert.equal(c.get('SELECT status FROM room_closures WHERE id=?',req.request_id).status,'accepted');
});

test('拒绝、撤回解散不会关闭房间，历史无创建人小屋允许双方申请',t=>{
  const {s,c,users:[a,b],community}=setup(t),room=s.pair(a.id,b.id).space_id;s.run('UPDATE spaces SET created_by=NULL WHERE id=?',room);
  assert.ok(c.closureInfo(b,room).canRequest);const r=community(b,'requestClose',{space_id:room,mode:'unbound'}),m=c.overview(a).pending[0];assert.throws(()=>community(b,'requestClose',{space_id:room,mode:'deleted'}),/已经/);community(a,'respond',{id:m.id,accept:false});assert.equal(s.state(a,room).space.status,'active');assert.equal(c.get('SELECT status FROM room_closures WHERE id=?',r.request_id).status,'declined');
  const next=community(a,'requestClose',{space_id:room,mode:'deleted'}),mail=c.overview(b).pending[0];community(a,'cancelClose',{request_id:next.request_id});assert.throws(()=>community(b,'respond',{id:mail.id,accept:true}),/已处理/);assert.equal(s.state(b,room).space.status,'active');
});

test('解散最后同意前重新核对旧卡欠款，失败保留待回复并能补齐后重试',t=>{
  const {s,c,users:[a,b],community,call,task}=setup(t),room=s.pair(a.id,b.id,a.id).space_id;
  call(b,'/api/admin/templates',{space_id:room,templates:['wish-18']});s.issue({...a,space_id:room},s.get('SELECT * FROM prizes'),'test');s.post(room,-10*COIN,'undo','待补','test');
  community(a,'requestClose',{space_id:room,mode:'deleted'});const mail=c.overview(b).pending[0];assert.throws(()=>community(b,'respond',{id:mail.id,accept:true}),/待补余额/);assert.equal(s.state(a,room).space.status,'active');assert.equal(s.get('SELECT status FROM mailbox WHERE id=?',mail.id).status,'pending');const tid=task(a,room);call(a,'/api/complete',{space_id:room,task_id:tid,done:true});community(b,'respond',{id:mail.id,accept:true});assert.equal(s.state(a,room).space.status,'deleted');
});

test('家庭解散需每位成员同意，等待时不能加人，最后同意才关闭全体空间',t=>{
  const {s,c,users:[a,b,d,out],makeFamily,join,community}=setup(t),ra=makeFamily(),rb=join(b,ra),rd=join(d,ra),invite=community(a,'familyInvite',{space_id:ra});
  const r=community(a,'requestClose',{space_id:ra,mode:'unbound'});assert.throws(()=>s.tx(()=>s.acceptInvite(out,invite.code)),/商量解散/);assert.throws(()=>community(b,'familyInvite',{space_id:rb}),/商量解散/);
  community(b,'respond',{id:c.overview(b).pending[0].id,accept:true});assert.equal(s.state(a,ra).space.status,'active');community(d,'respond',{id:c.overview(d).pending[0].id,accept:true});for(const [u,room] of [[a,ra],[b,rb],[d,rd]])assert.equal(s.state(u,room).space.status,'unbound');assert.equal(c.get('SELECT status FROM room_closures WHERE id=?',r.request_id).status,'accepted');assert.equal(c.get('SELECT remaining FROM invites WHERE hash=?',hash(invite.code)).remaining,0);
});

test('操作日志跟随事务：重复请求只一条，失败不留记录，历史不能更新或删除',t=>{
  const {s,c,users:[a],makeFamily,op,call}=setup(t),room=makeFamily(),b={space_id:room,tasks:[{title:'<script>计划</script>',points:20,recurrence:'daily'}]},key=randomUUID();
  const create=()=>op(a,'/api/tasks',b,()=>s.createTasks(a,b),key);const tid=create().ids[0];create();assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/tasks'").n,1);
  for(const done of [true,false,true])call(a,'/api/complete',{space_id:room,task_id:tid,done});assert.equal(s.balance(room),20*COIN);assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/complete'").n,3);assert.equal(c.logs(a,{space_id:room}).entries.filter(e=>e.summary.includes('撤销')).length,1);
  const count=s.get('SELECT COUNT(*) n FROM room_audit').n;assert.throws(()=>call(a,'/api/complete',{space_id:room,task_id:'absent',done:true}));assert.equal(s.get('SELECT COUNT(*) n FROM room_audit').n,count);assert.throws(()=>s.run('UPDATE room_audit SET summary=?','fake'),/append only/);assert.throws(()=>s.run('DELETE FROM room_audit'),/append only/);
});

test('日志游标分页不丢失旧记录，其他小屋及其他家庭不可查看',t=>{
  const {s,c,users:[a,b,d],makeFamily,join}=setup(t),ra=makeFamily(),rb=join(b,ra),other=makeFamily(d);for(let i=0;i<60;i++)c.audit(a,ra,'test','记录 '+i);
  const first=c.logs(b,{space_id:rb}),second=c.logs(b,{space_id:rb,before:first.next});assert.equal(first.entries.length,50);assert.ok(second.entries.length>=10);assert.equal(new Set([...first.entries,...second.entries].map(e=>e.id)).size,first.entries.length+second.entries.length);assert.throws(()=>c.logs(d,{space_id:ra}),/没有向你开放/);assert.throws(()=>c.logs(a,{space_id:other}),/没有向你开放/);
});

test('好友必须对方同意，不能自加、伪造批准或互发重复申请',t=>{
  const {c,users:[a,b,out],community}=setup(t);assert.throws(()=>community(a,'friendRequest',{username:a.username}),/不能添加自己/);const r=community(a,'friendRequest',{username:b.username});assert.equal(c.overview(a).friends.length,0);assert.throws(()=>community(b,'friendRequest',{username:a.username}),/已经/);assert.throws(()=>community(out,'respond',{id:r.id,accept:true}),/不属于你/);community(b,'respond',{id:r.id,accept:true});assert.equal(c.overview(a).friends[0].id,b.id);assert.equal(c.overview(b).friends[0].id,a.id);assert.throws(()=>community(b,'respond',{id:r.id,accept:true}),/已处理/);assert.throws(()=>community(a,'friendRequest',{username:b.username}),/已经是好友/);
});

test('日记仅本人可读，按日期和内容范围批准快照，后续修改不扩大共享',t=>{
  const {s,c,users:[a,b,out],community,friends,task,call}=setup(t),day=dayAt();friends(a,b);
  community(b,'saveDiary',{day,content:'我的私密小日记',expectedContent:''});assert.equal(c.diary(a,{day,user_id:b.id}).content,'');assert.equal(c.diary(out,{day,user_id:b.id}).content,'');
  const tid=task(b,b.id,'看星星的计划');call(b,'/api/complete',{space_id:b.id,task_id:tid,done:true});
  const req=community(a,'viewRequest',{user_id:b.id,day,scope:'diary'});assert.throws(()=>c.previewShare(a,{id:req.id}),/不属于你/);const preview=c.previewShare(b,{id:req.id});assert.equal(preview.snapshot.activity,undefined);assert.equal(preview.snapshot.diary.content,'我的私密小日记');
  community(b,'respond',{id:req.id,accept:true,snapshotHash:preview.snapshotHash});const share=s.get('SELECT * FROM day_shares WHERE mail_id=?',req.id);assert.equal(c.readShare(a,{id:share.id}).snapshot.diary.content,'我的私密小日记');assert.throws(()=>c.readShare(out,{id:share.id}),/未获准/);
  community(b,'saveDiary',{day,content:'后来写的内容不能悄悄分享',expectedContent:'我的私密小日记'});assert.equal(c.readShare(a,{id:share.id}).snapshot.diary.content,'我的私密小日记');community(b,'revokeShare',{id:share.id});assert.throws(()=>c.readShare(a,{id:share.id}),/撤回/);
});

test('分享前内容若变化必须重新预览；拒绝不生成分享，动态不含日记或其他用户身份',t=>{
  const {s,c,users:[a,b,d],community,friends,makeFamily,join,task,call}=setup(t),day=dayAt();friends(a,b);const room=makeFamily(),rb=join(b,room);join(d,room);
  task(a,room,'不能分享的其他人计划');const tid=task(b,rb,'我的计划');call(b,'/api/complete',{space_id:rb,task_id:tid,done:true});community(b,'saveDiary',{day,content:'不能随动态泄露的日记',expectedContent:''});
  const req=community(a,'viewRequest',{user_id:b.id,day,scope:'activity'}),p=c.previewShare(b,{id:req.id});assert.equal(p.snapshot.diary,undefined);const json=JSON.stringify(p.snapshot);for(const privateText of [room,rb,a.id,d.id,'不能分享的其他人计划','不能随动态泄露的日记'])assert.ok(!json.includes(privateText));
  call(b,'/api/complete',{space_id:rb,task_id:tid,done:false});assert.throws(()=>community(b,'respond',{id:req.id,accept:true,snapshotHash:p.snapshotHash}),/变化/);assert.equal(s.all('SELECT * FROM day_shares').length,0);community(b,'respond',{id:req.id,accept:false});assert.equal(s.all('SELECT * FROM day_shares').length,0);
});

test('取消好友撤回双方分享及待处理申请，不解散小屋，日期和日记版本严格校验',t=>{
  const {s,c,users:[a,b,out],community,friends}=setup(t),day=dayAt();friends(a,b);const room=s.pair(a.id,b.id).space_id;const req=community(a,'viewRequest',{user_id:b.id,day,scope:'both'}),p=c.previewShare(b,{id:req.id});community(b,'respond',{id:req.id,accept:true,snapshotHash:p.snapshotHash});const share=s.get('SELECT id FROM day_shares');const pending=community(b,'viewRequest',{user_id:a.id,day,scope:'both'});
  assert.throws(()=>community(out,'viewRequest',{user_id:b.id,day,scope:'both'}),/先成为好友/);assert.throws(()=>community(a,'viewRequest',{user_id:b.id,day:'2099-01-01',scope:'both'}),/有效日期/);assert.throws(()=>community(a,'saveDiary',{day:'2026-02-30',content:'bad',expectedContent:''}),/有效日期/);
  community(a,'saveDiary',{day,content:'第一版',expectedContent:''});assert.throws(()=>community(a,'saveDiary',{day,content:'会覆盖',expectedContent:''}),/新修改/);
  community(a,'removeFriend',{user_id:b.id});assert.equal(c.overview(a).friends.length,0);assert.throws(()=>c.readShare(a,{id:share.id}),/结束/);assert.equal(s.get('SELECT status FROM mailbox WHERE id=?',pending.id).status,'cancelled');assert.equal(s.state(a,room).space.status,'active');
});

test('家庭邀请登录前预览不泄露成员名单，已加入者可回访用过的链接',t=>{
  const {s,users:[a,b,d],makeFamily,community}=setup(t),room=makeFamily(),invite=community(a,'familyInvite',{space_id:room}),identity=new Identity(s);
  const preview=identity.previewInvite(null,invite.code);assert.equal(preview.direction,'family');assert.equal(preview.count,1);assert.equal(preview.members,undefined);const rb=s.tx(()=>s.acceptInvite(b,invite.code)).space_id;assert.equal(identity.previewInvite(b,invite.code).existingSpace,rb);assert.throws(()=>identity.previewInvite(d,invite.code),/用过/);assert.throws(()=>identity.previewInvite(null,invite.code),/用过/);
});

test('真实 HTTP：鉴权、CSRF、幂等、通知轮询和六人容量同时请求均正确',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));const origin='http://127.0.0.1:'+server.address().port;
  const users=Array.from({length:8},(_,i)=>s.newUser({username:'http_'+i,name:'访客'+i,password:''})),sessions=users.map(u=>s.session(u.id));
  const request=async(i,path,body,key=randomUUID(),csrf=true)=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(i===null?{}:{Cookie:'starlight_session='+sessions[i].token,...(csrf?{'X-CSRF-Token':sessions[i].csrf}:{}),'Idempotency-Key':key})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
  assert.equal((await fetch(origin+'/community.js')).status,200);assert.equal((await request(null,'community/inbox')).status,401);assert.equal((await request(0,'family/create',{name:'没令牌'},randomUUID(),false)).status,403);
  const key=randomUUID(),created=await Promise.all([request(0,'family/create',{name:'并发家庭'},key),request(0,'family/create',{name:'并发家庭'},key)]);assert.equal(created[0].status,200);assert.equal(created[0].body.space_id,created[1].body.space_id);const room=created[0].body.space_id;
  const codes=[];for(let i=1;i<=7;i++)codes.push((await request(0,'family/invite',{space_id:room})).body.code);
  const joins=await Promise.all(codes.map((code,i)=>request(i+1,'pairs/accept',{code})));assert.equal(joins.filter(r=>r.status===200).length,5);assert.equal(joins.filter(r=>r.status===409).length,2);assert.equal(s.get('SELECT COUNT(*) n FROM family_members').n,6);
  const member=joins.findIndex(r=>r.status===200)+1,outside=joins.findIndex(r=>r.status!==200)+1;assert.equal((await request(outside,'community/logs?space_id='+room)).status,403);
  const close=await request(0,'rooms/close',{space_id:room,mode:'deleted'});assert.equal(close.status,200);const state=(await request(member,'state')).body;assert.ok(state.community.pending.some(m=>m.kind==='room_close'));const mail=state.community.pending.find(m=>m.kind==='room_close');assert.equal((await request(outside,'community/respond',{id:mail.id,accept:true})).status,409);
  const responseKey=randomUUID();const responses=await Promise.all([request(member,'community/respond',{id:mail.id,accept:false},responseKey),request(member,'community/respond',{id:mail.id,accept:false},responseKey)]);assert.ok(responses.every(r=>r.status===200));assert.equal(s.get('SELECT status FROM spaces WHERE id=?',room).status,'active');assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='room.close.vote'").n,1);
});
