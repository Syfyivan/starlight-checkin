import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store,hash} from '../lib/store.mjs';
import {Identity} from '../lib/identity.mjs';
import {migrate} from '../lib/migrate.mjs';
import {createApp} from '../server.mjs';
function setup(t){
 const s=new Store(':memory:');t.after(()=>s.db.close());const users=Array.from({length:8},(_,i)=>s.newUser({username:'chat_'+i,name:'朋友'+i,password:''}));
 const friend=(a,b)=>{const [x,y]=[a.id,b.id].sort();s.run('INSERT OR IGNORE INTO friends VALUES(?,?,?)',x,y,new Date().toISOString());};
 const op=(u,action,body,method,key=randomUUID())=>s.operation(u,key,action,body,()=>method(body));
 const send=(a,b,text='你好',key)=>op(a,'/api/friends/message',{user_id:b.id,body:text},p=>s.friends.send(a,p),key);
 const invite=(a,b,extra={},key)=>op(a,'/api/friends/invite',{user_id:b.id,direction:'learner',...extra},p=>s.friends.invite(a,p),key);
 const respond=(u,mid,accept=true,key)=>op(u,'/api/community/respond',{id:mid,accept},p=>s.community.respond(u,p),key);
 return {s,users,friend,send,invite,respond};
}
test('双方成为好友才可收发和读取；删除好友即时阻断，私聊不进小屋日志',t=>{
 const {s,users:[a,b,c],friend,send}=setup(t);assert.throws(()=>send(a,b),/先成为好友/);friend(a,b);friend(b,c);
 const logCount=s.all('SELECT * FROM room_audit').length;send(a,b,'第一行\n第二行 <script>');send(b,a,'收到');send(c,b,'第三个人的消息');
 const rows=s.friends.messages(a,{user_id:b.id}).entries;assert.equal(rows.length,2);assert.equal(rows[0].body,'第一行\n第二行 <script>');assert.ok(rows.every(m=>m.sender_id!==c.id));assert.throws(()=>s.friends.messages(c,{user_id:a.id}),/先成为好友/);assert.equal(s.all('SELECT * FROM room_audit').length,logCount);
 assert.throws(()=>send(a,a),/先成为好友/);s.tx(()=>s.community.removeFriend(a,{user_id:b.id}));assert.throws(()=>send(a,b),/先成为好友/);assert.throws(()=>s.friends.messages(b,{user_id:a.id}),/先成为好友/);assert.equal(s.all('SELECT * FROM friend_messages').length,3);
});
test('发送幂等、正文长度和频率限制，读取只消除本人与指定好友的未读',t=>{
 const {s,users:[a,b,c],friend,send}=setup(t);friend(a,b);friend(a,c);const key=randomUUID();send(b,a,'同一条',key);send(b,a,'同一条',key);send(c,a,'其他好友');
 assert.equal(s.friends.list(a).reduce((n,f)=>n+f.unread,0),2);const last=s.friends.messages(a,{user_id:b.id}).after;
 s.tx(()=>s.friends.read(a,{user_id:b.id,through:last}));assert.equal(s.friends.list(a).find(f=>f.id===b.id).unread,0);assert.equal(s.friends.list(a).find(f=>f.id===c.id).unread,1);
 assert.throws(()=>send(a,b,'  \n '));assert.throws(()=>send(a,b,'a'.repeat(2001)));assert.throws(()=>s.friends.read(a,{user_id:b.id,through:-1}));
 for(let i=0;i<60;i++)send(a,b,'第'+i+'条');assert.throws(()=>send(a,b),/有点快/);assert.equal(s.get('SELECT COUNT(*) n FROM friend_messages WHERE sender_id=?',a.id).n,60);
});
test('消息向前翻页和增量轮询不漏不重，读游标不会标记晚到消息',t=>{
 const {s,users:[a,b],friend,send}=setup(t);friend(a,b);for(let i=0;i<55;i++)send(a,b,'消息'+i);
 const latest=s.friends.messages(b,{user_id:a.id}),older=s.friends.messages(b,{user_id:a.id,before:latest.before});assert.equal(latest.entries.length,50);assert.equal(older.entries.length,5);assert.equal(older.before,null);assert.equal(new Set([...older.entries,...latest.entries].map(m=>m.id)).size,55);
 send(a,b,'晚到的消息');s.tx(()=>s.friends.read(b,{user_id:a.id,through:latest.after}));assert.equal(s.friends.list(b)[0].unread,1);const more=s.friends.messages(b,{user_id:a.id,after:latest.after});assert.equal(more.entries.length,1);assert.equal(more.entries[0].body,'晚到的消息');assert.throws(()=>s.friends.messages(b,{user_id:a.id,before:5,after:2}));
});
test('两种双人小屋邀请都需指定好友同意，重放不会重复建屋或寄信',t=>{
 const {s,users:[a,b,c],friend,invite,respond}=setup(t);friend(a,b);friend(a,c);const key=randomUUID(),r=invite(a,b,{},key);assert.equal(invite(a,b,{},key).mail_id,r.mail_id);
 assert.throws(()=>s.friends.previewInvite(c,{id:r.mail_id}),/不是寄给你/);assert.throws(()=>respond(c,r.mail_id));assert.throws(()=>invite(a,b),/已经在朋友信箱/);
 const mail=s.get('SELECT * FROM mailbox WHERE id=?',r.mail_id);assert.equal(mail.recipient_id,b.id);assert.ok(!JSON.parse(mail.payload).code);assert.equal(s.friends.previewInvite(b,{id:r.mail_id}).direction,'learner');
 const responseKey=randomUUID(),room=respond(b,r.mail_id,true,responseKey);assert.equal(respond(b,r.mail_id,true,responseKey).space_id,room.space_id);const pair=s.get('SELECT * FROM spaces WHERE id=?',room.space_id);assert.equal(pair.learner_id,b.id);assert.equal(pair.giver_id,a.id);assert.equal(s.get('SELECT COUNT(*) n FROM spaces WHERE learner_id=? AND giver_id=?',b.id,a.id).n,1);
 const reverse=invite(a,b,{direction:'manager'}),reverseRoom=respond(b,reverse.mail_id);assert.equal(s.get('SELECT giver_id FROM spaces WHERE id=?',reverseRoom.space_id).giver_id,b.id);
});
test('过期、拒绝、取消好友的邀请不能建屋；信件失败时邀请码也回滚',t=>{
 const {s,users:[a,b],friend,invite,respond}=setup(t);friend(a,b);const first=invite(a,b);s.run('UPDATE invites SET expires=0');assert.throws(()=>respond(b,first.mail_id),/过期/);respond(b,first.mail_id,false);
 const second=invite(a,b);respond(b,second.mail_id,false);assert.equal(s.get("SELECT COUNT(*) n FROM spaces WHERE giver_id IS NOT NULL").n,0);
 const third=invite(a,b);s.tx(()=>s.community.removeFriend(a,{user_id:b.id}));assert.equal(s.get('SELECT status FROM mailbox WHERE id=?',third.mail_id).status,'cancelled');assert.throws(()=>respond(b,third.mail_id));
 friend(a,b);const before=s.all('SELECT * FROM invites');s.db.exec("CREATE TRIGGER fail_invite BEFORE INSERT ON mailbox WHEN NEW.kind='room_invite' BEGIN SELECT RAISE(ABORT,'mail failed'); END");assert.throws(()=>invite(a,b),/mail failed/);assert.deepEqual(s.all('SELECT * FROM invites'),before);
});
test('家庭信件邀请沿用六人上限；最后一位之后的邀请可拒绝且不占位置',t=>{
 const {s,users,friend,invite,respond}=setup(t),a=users[0],space=s.tx(()=>s.community.createFamily(a,{name:'小家庭'})).space_id,letters=[];
 for(const b of users.slice(1)){friend(a,b);letters.push(invite(a,b,{direction:'family',space_id:space,label:'一起回家吧'}).mail_id);}
 assert.equal(JSON.parse(s.get('SELECT payload FROM mailbox WHERE id=?',letters[0]).payload).label,'一起回家吧');for(let i=0;i<5;i++)respond(users[i+1],letters[i]);assert.equal(s.get('SELECT COUNT(*) n FROM family_members').n,6);assert.throws(()=>respond(users[6],letters[5]),/六位/);respond(users[6],letters[5],false);assert.equal(s.get('SELECT COUNT(*) n FROM family_members').n,6);
});
test('定向邀请即使知道原始邀请码也不能被其他账号或匿名注册使用；公共链接保持可用',t=>{
 const {s,users:[a,b,c],friend,invite}=setup(t);friend(a,b);const raw='1234567890abcdef12345678',original=s.invite.bind(s);s.invite=(u,v)=>original(u,v,()=>raw);invite(a,b);
 const identity=new Identity(s,{origin:'http://example.test',basePath:'/'});assert.throws(()=>identity.inviteValid(raw),/指定的好友/);assert.throws(()=>identity.previewInvite(c,raw),/指定的好友/);assert.throws(()=>s.acceptInvite(c,raw),/指定的好友/);assert.equal(identity.previewInvite(b,raw).direction,'learner');
 s.invite=original;const publicInvite=s.invite(a,{direction:'learner'});assert.throws(()=>s.tx(()=>s.acceptInvite(a,publicInvite.code)),/自己发出的邀请/);assert.equal(identity.previewInvite(c,publicInvite.code).name,a.name);assert.ok(s.tx(()=>s.acceptInvite(c,publicInvite.code)).space_id);
});
test('v16 升级保留原用户、好友、邀请和信箱，重复迁移幂等',t=>{
 const {s,users:[a,b],friend}=setup(t);friend(a,b);s.invite(a,{direction:'learner'});s.community.notice(a,b.id,'原有信件','保持原样');s.db.exec('DROP TABLE friend_messages;ALTER TABLE invites DROP COLUMN recipient_id;PRAGMA user_version=16');
 const before={users:s.all('SELECT * FROM users'),friends:s.all('SELECT * FROM friends'),mail:s.all('SELECT * FROM mailbox'),invites:s.all('SELECT * FROM invites')};migrate(s.db);migrate(s.db);assert.equal(s.get('PRAGMA user_version').user_version,21);assert.deepEqual(s.all('SELECT * FROM users'),before.users);assert.deepEqual(s.all('SELECT * FROM friends'),before.friends);assert.deepEqual(s.all('SELECT * FROM mailbox'),before.mail);assert.deepEqual(s.all('SELECT * FROM invites').map(({recipient_id,...r})=>r),before.invites.map(r=>({...r})));assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});
test('真实 HTTP 聊天和信件邀请检查登录、CSRF、好友权限及幂等',async t=>{
 const app=await createApp({dbPath:':memory:',demo:false}),s=app.store;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(()=>{s.db.close();r();})));const base='http://127.0.0.1:'+app.server.address().port;
 const a=s.newUser({username:'httpchat_a',name:'甲',password:''}),b=s.newUser({username:'httpchat_b',name:'乙',password:''}),c=s.newUser({username:'httpchat_c',name:'丙',password:''}),[x,y]=[a.id,b.id].sort();s.run('INSERT INTO friends VALUES(?,?,?)',x,y,new Date().toISOString());const sa=s.session(a.id),sb=s.session(b.id),sc=s.session(c.id);
 const request=async(session,route,body,key=randomUUID(),csrf=session?.csrf)=>{const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{Cookie:session?'starlight_session='+session.token:'',Origin:base,'X-CSRF-Token':csrf||'','Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 for(const [path,type] of [['/chat.js','text/javascript'],['/chat.css','text/css']]){const r=await fetch(base+path);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes(type));}
 assert.equal((await request(null,'friends/chat?user_id='+b.id)).status,401);assert.equal((await request(sa,'friends/message',{user_id:b.id,body:'你好'},randomUUID(),'bad')).status,403);assert.equal((await request(sc,'friends/chat?user_id='+a.id)).status,403);
 const key=randomUUID(),body={user_id:b.id,body:'你好\n小伙伴'};assert.equal((await request(sa,'friends/message',body,key)).status,200);assert.equal((await request(sa,'friends/message',body,key)).status,200);assert.equal((await request(sb,'friends/chat?user_id='+a.id)).data.entries.length,1);
 const letter=await request(sa,'friends/invite',{user_id:b.id,direction:'learner'});assert.equal(letter.status,200);assert.equal((await request(sb,'friends/invite-preview?id='+letter.data.mail_id)).status,200);assert.equal((await request(sc,'community/respond',{id:letter.data.mail_id,accept:true})).status,409);assert.equal((await request(sb,'community/respond',{id:letter.data.mail_id,accept:true})).status,200);
});
