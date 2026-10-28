import {randomBytes} from 'node:crypto';
import {id,now,hash,string,integer,requireThat} from './store.mjs';
import {dayAt,COIN} from './common.mjs';

const taskActions=['/api/tasks/edit','/api/tasks','/api/tasks/estimate','/api/complete','/api/archive'];
const labels={'/api/tasks/edit':'编辑计划','/api/tasks/estimate':'调整计划预估时间','/api/pets/use':'照顾小伙伴','/api/pets/dress':'更换宠物形象','/api/admin/lottery/defaults':'布置默认抽奖奖励','/api/admin/lottery/copy':'复制奖励到另一份清单','/api/cards/use':'使用功能卡','/api/cards/rename-room':'使用小屋改名卡','/api/tasks':'添加计划','/api/complete':'更新打卡','/api/archive':'归档计划','/api/bonus/claim':'领取全勤奖励','/api/buy':'兑换心愿卡','/api/draw':'参与抽奖','/api/redeem':'申请报销','/api/redeem/cancel':'撤回报销','/api/share':'生成核销链接','/api/cards/merge':'合成卡片','/api/cards/convert':'转换万能卡','/api/lesson':'读完知识小课','/api/admin/prize':'调整心愿卡','/api/admin/templates':'添加默认卡','/api/admin/prizes/remove':'移除心愿卡','/api/admin/prizes/restore':'恢复心愿卡','/api/admin/odds':'调整中奖率','/api/admin/settings':'调整小屋规则','/api/admin/fulfill':'确认报销核销'};
export class Community {
  constructor(store){this.s=store;}
  get(q,...a){return this.s.get(q,...a);} all(q,...a){return this.s.all(q,...a);} run(q,...a){return this.s.run(q,...a);}
  date(value){requireThat(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<=dayAt()&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'选一个今天或以前的有效日期吧');return value;}
  audit(user,spaceId,action,summary,detail={}){
    const room=this.get('SELECT family_id FROM spaces WHERE id=?',spaceId);requireThat(room,'小屋不存在',404);
    this.run('INSERT INTO room_audit(id,space_id,family_id,actor_id,actor_name,action,summary,detail,created) VALUES(?,?,?,?,?,?,?,?,?)',id(),spaceId,room.family_id,user.id,user.name,action,summary,JSON.stringify(detail),now());
  }
  before(user,action,body){
    if(!labels[action])return null;
    const card=body.card_id?this.get('SELECT space_id,title FROM cards WHERE id=?',body.card_id):null;
    const spaceId=action==='/api/admin/fulfill'?card?.space_id:(body.space_id||user.space_id||this.s.personalSpaceId(user.id));
    const room=this.get('SELECT id FROM spaces WHERE id=?',spaceId);if(!room)return null;
    const task=body.task_id?this.get('SELECT title,points,archived,category,task_kind,repeat_days,start_date,deadline,quadrant,estimated_minutes,difficulty,score_override FROM tasks WHERE id=? AND space_id=?',body.task_id,spaceId):null;
    const rewardSpace=this.s.rewardSpaceId(spaceId);
    const prize=body.id||body.prize_id?this.get('SELECT title,cost,stock,weight,active,removed,face_cents,wait_days,effect FROM prizes WHERE id=? AND room_id=?',body.id||body.prize_id,rewardSpace):null;
    const completion=action==='/api/complete'?this.get('SELECT points,difficulty FROM completions WHERE task_id=? AND day=? AND done=1',body.task_id,dayAt()):null;
    return {spaceId,task,prize,card,completion,balance:this.s.balance(spaceId),tickets:this.s.ticketBalance(spaceId),settings:action==='/api/admin/settings'?this.s.settings(spaceId):null,odds:action==='/api/admin/odds'?this.s.oddsConfig(spaceId):null};
  }
  after(user,action,body,result,before){
    if(!before)return;const {spaceId,task,card,prize}=before;let summary=labels[action],detail={};
    if(action==='/api/tasks'){detail.tasks=result.ids.map(id=>{const t=this.get('SELECT title,points,recurrence,start_date,difficulty,estimated_minutes,task_kind,repeat_days,deadline FROM tasks WHERE id=?',id);return {...t,points:t.points/COIN};});summary=`添加 ${detail.tasks.length} 个计划 · ${detail.tasks.map(t=>t.title).join('、').slice(0,180)}`;}
    if(action==='/api/complete'){summary=(result.rescore?'调整任务得分':body.done?(result.awarded!==undefined?'完成计划':'更新完成记录'):'撤销完成')+' · '+(task?.title||'计划');detail.task={title:task?.title,done:body.done,points:(result.amount||0)/COIN,nominal:result.nominal===undefined?undefined:result.nominal/COIN,awarded:result.awarded===undefined?undefined:result.awarded/COIN,difficulty:result.difficulty,mode:result.scoreMode,rescore:result.rescore,capped:result.capped,previous:before.completion?{points:before.completion.points/COIN,difficulty:before.completion.difficulty}:null};}
    if(action==='/api/tasks/edit'){summary+=' · '+task?.title;detail.before=task;detail.after=this.get('SELECT title,points,archived,category,task_kind,repeat_days,start_date,deadline,quadrant,estimated_minutes,difficulty,score_override FROM tasks WHERE id=?',body.task_id);}
    if(action==='/api/tasks/estimate'){summary+=' · '+task?.title;detail.previousMinutes=result.previousMinutes;detail.estimatedMinutes=result.estimated_minutes;}
    if(action.startsWith('/api/pets/')){summary+=' · '+result.note;detail.petXp=result.petXp||0;detail.form=result.pet?.form;detail.outfit=result.pet?.outfit;}
    if(action==='/api/archive')summary+=' · '+(task?.title||'计划');
    if(action==='/api/buy')summary+=' · '+(prize?.title||result.card?.title||'心愿');
    if(action==='/api/draw'){summary+=` · ${result.card?.title||'下次好运'}（${result.mode==='ticket'?'免费机会':'学习币'}）`;detail.mode=result.mode;}
    if(card)summary+=' · '+card.title;
    if(action==='/api/cards/rename-room'){summary='更换小屋招牌 · '+result.name;detail={oldName:result.oldName||'默认小屋名',name:result.name,card_id:result.card_id};}
    if(action==='/api/admin/fulfill')detail.paid_cents=body.paid_cents;
    if(action==='/api/admin/prize'){summary+=' · '+body.title;detail.before=prize;detail.after=this.get('SELECT title,cost,stock,weight,active,removed,face_cents,wait_days,effect FROM prizes WHERE id=?',result.id);}
    if(action==='/api/admin/settings'){detail.before=before.settings;detail.after=this.s.settings(spaceId);}
    if(action==='/api/admin/odds'){const named=entries=>entries.map(e=>({...e,title:this.get('SELECT title FROM prizes WHERE id=?',e.id)?.title||'心愿卡'}));detail.before=named(before.odds.entries);detail.after=named(body.entries);}
    if(body.ids){detail.ids=body.ids;detail.cards=body.ids.map(pid=>this.get('SELECT title FROM prizes WHERE id=?',pid)?.title||'心愿卡');}if(body.templates){detail.templates=body.templates;detail.added=result.added;detail.restored=result.restored;}
    if(result.card&&['/api/cards/merge','/api/cards/convert'].includes(action)){summary+=' · '+result.card.title;detail.cardMove=result.move;}
    if(result.dropOdds)detail.dropOdds=result.dropOdds;if(result.usedCard)summary+=' · '+result.usedCard+(result.card?' → '+result.card.title:'');if(result.theme)detail.theme=result.theme;if(result.copied)summary+=' · '+result.copied;
      detail.coins=(this.s.balance(spaceId)-before.balance)/COIN;detail.tickets=this.s.ticketBalance(spaceId)-before.tickets;
    if(detail.coins)summary+=` · ${detail.coins>0?'+':''}${detail.coins} 学习币`;
    if(result.bonus)detail.bonus=result.bonus;
    this.audit(user,spaceId,action,summary,detail);
  }
  logs(user,b={}){
    const spaceId=this.s.viewSpace(user,b.space_id),room=this.get('SELECT family_id FROM spaces WHERE id=?',spaceId),cursor=b.before?integer(Number(b.before),1,Number.MAX_SAFE_INTEGER,'日志位置'):Number.MAX_SAFE_INTEGER;
    const rows=this.all(`SELECT seq,id,actor_id,actor_name,action,summary,detail,created FROM room_audit WHERE ${room.family_id?'family_id':'space_id'}=? AND seq<? ORDER BY seq DESC LIMIT 51`,room.family_id||spaceId,cursor);
    return {entries:rows.slice(0,50).map(r=>({...r,detail:JSON.parse(r.detail)})),next:rows.length>50?rows[49].seq:null};
  }
  members(familyId){return this.all('SELECT m.user_id,m.space_id,m.is_admin,u.name,u.username FROM family_members m JOIN users u ON u.id=m.user_id WHERE m.family_id=? ORDER BY m.created,m.user_id',familyId);}
  family(user,spaceId){
    const room=this.get('SELECT * FROM spaces WHERE id=?',this.s.viewSpace(user,spaceId));if(!room.family_id)return null;
    const f=this.get('SELECT * FROM families WHERE id=?',room.family_id);
    return {...f,members:this.members(f.id).map(m=>{const tasks=this.s.todayTasks(m.space_id);return {...m,total:tasks.length,done:tasks.filter(t=>t.done).length,balance:this.s.balance(m.space_id)};}),mySpace:this.get('SELECT space_id FROM family_members WHERE family_id=? AND user_id=?',f.id,user.id).space_id};
  }
  createFamily(user,b){
    requireThat(this.get("SELECT COUNT(*) n FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.user_id=? AND f.status='active'",user.id).n<20,'先照顾好已有的家庭吧，最多同时加入 20 个家庭');
    const mode=b.mode??'classic';requireThat(['classic','friends','guardian'].includes(mode),'请选择家庭形式');
    const name=string(b.name,'家庭名字',24),fid=id(),sid=id(),created=now();
    this.run('INSERT INTO spaces(id,learner_id,created,created_by,family_id) VALUES(?,?,?,?,?)',sid,user.id,created,user.id,fid);
    this.run('INSERT INTO families(id,name,creator_id,pool_space_id,created,mode) VALUES(?,?,?,?,?,?)',fid,name,user.id,sid,created,mode);
    this.run('INSERT INTO family_members VALUES(?,?,?,?,?)',fid,user.id,sid,1,created);
    this.audit(user,sid,'family.create','成立家庭 · '+name);return {ok:true,space_id:sid};
  }
  pendingClose(spaceId){const canonical=this.s.rewardSpaceId(spaceId);return this.get("SELECT * FROM room_closures WHERE space_id=? AND status='pending'",canonical)||null;}
  familyInvite(user,b){
    const f=this.family(user,b.space_id);requireThat(f?.status==='active','这个家庭已经收起来了',409);requireThat(f.members.length<6,'小屋坐满六位伙伴啦',409);requireThat(!this.pendingClose(f.pool_space_id),'家庭正在商量解散，先等大家决定吧',409);
    const code=randomBytes(12).toString('hex');this.run('INSERT INTO invites(hash,label,remaining,expires,created,creator_id,direction,family_id) VALUES(?,?,?,?,?,?,?,?)',hash(code),f.name,1,Date.now()+7*86400_000,now(),user.id,'family',f.id);
    this.audit(user,f.pool_space_id,'family.invite','发出一张家庭邀请');return {ok:true,code,direction:'family',name:f.name};
  }
  previewFamily(user,invite){
    const f=this.get('SELECT * FROM families WHERE id=?',invite.family_id);requireThat(f?.status==='active','这个家庭已经收起来了',409);
    const own=user?this.get('SELECT space_id FROM family_members WHERE family_id=? AND user_id=?',f.id,user.id):null;
    if(!own){requireThat(invite.remaining>0&&invite.expires>Date.now(),'邀请码已用过或过期啦，请朋友再发一张邀请');requireThat(!this.pendingClose(f.pool_space_id),'这个家庭正在商量解散，暂时不接待新伙伴',409);requireThat(this.members(f.id).length<6,'这个家庭已经有六位伙伴啦',409);}
    const creator=this.get('SELECT name,username FROM users WHERE id=? AND enabled=1',invite.creator_id);requireThat(creator,'邀请人暂时不可用');
    return {...creator,direction:'family',family_name:f.name,count:this.members(f.id).length,...(own?{existingSpace:own.space_id}:{})};
  }
  joinFamily(user,invite){
    const preview=this.previewFamily(user,invite);if(preview.existingSpace)return {ok:true,space_id:preview.existingSpace};
    requireThat(this.get("SELECT COUNT(*) n FROM family_members m JOIN families f ON f.id=m.family_id WHERE m.user_id=? AND f.status='active'",user.id).n<20,'最多同时加入 20 个家庭');
    const sid=id(),created=now(),f=this.get('SELECT * FROM families WHERE id=?',invite.family_id);
    this.run('INSERT INTO spaces(id,learner_id,created,created_by,family_id) VALUES(?,?,?,?,?)',sid,user.id,created,f.creator_id,f.id);
    this.run('INSERT INTO family_members VALUES(?,?,?,?,?)',f.id,user.id,sid,0,created);this.run('UPDATE invites SET remaining=remaining-1 WHERE hash=?',invite.hash);
    this.audit(user,sid,'family.join','加入家庭');
    for(const m of this.members(f.id).filter(m=>m.user_id!==user.id))this.notice(user,m.user_id,'家庭迎来新伙伴',`${user.name} 加入了「${f.name}」。`);
    return {ok:true,space_id:sid};
  }
  setAdmins(user,b){
    const f=this.family(user,b.space_id);requireThat(f&&f.status==='active'&&f.creator_id===user.id,'由家庭创建人来安排奖品管家哦',403);
    requireThat(Array.isArray(b.user_ids)&&b.user_ids.length>=1&&b.user_ids.length<=2&&new Set(b.user_ids).size===b.user_ids.length,'请选择 1–2 位奖品管家');requireThat(b.user_ids.every(uid=>f.members.some(m=>m.user_id===uid)),'管家需要是本家庭的成员');
    const old=f.members.filter(m=>m.is_admin).map(m=>m.user_id).sort();requireThat(JSON.stringify(old)===JSON.stringify([...(b.expected_admins||[])].sort()),'管家名单刚有变化，请刷新后再安排',409);
    for(const m of f.members)this.s.plans.settle(m.space_id);
    if(f.mode==='guardian')this.s.familyPlay.checkManagerOnly(f.members.filter(m=>b.user_ids.includes(m.user_id)).map(m=>m.space_id));
    this.run('UPDATE family_members SET is_admin=0 WHERE family_id=?',f.id);for(const uid of b.user_ids)this.run('UPDATE family_members SET is_admin=1 WHERE family_id=? AND user_id=?',f.id,uid);
    this.audit(user,f.pool_space_id,'family.admins','安排奖品管家 · '+f.members.filter(m=>b.user_ids.includes(m.user_id)).map(m=>m.name).join('、'),{before:old,after:b.user_ids});
    for(const m of f.members.filter(m=>m.user_id!==user.id))this.notice(user,m.user_id,'家庭管家名单更新啦','新的奖品管家：'+f.members.filter(x=>b.user_ids.includes(x.user_id)).map(x=>x.name).join('、'));
    return {ok:true};
  }
  mail(user,recipient,kind,subject,payload={},status='pending'){
    const mid=id(),created=now();this.run('INSERT INTO mailbox(id,sender_id,recipient_id,kind,subject,payload,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',mid,user.id,recipient,kind,subject,JSON.stringify(payload),status,created,created);return mid;
  }
  notice(user,recipient,subject,text){return this.mail(user,recipient,'notice',subject,{text},'done');}
  closureInfo(user,spaceId){
    const sid=this.s.viewSpace(user,spaceId),room=this.get('SELECT * FROM spaces WHERE id=?',sid),f=room.family_id?this.get('SELECT * FROM families WHERE id=?',room.family_id):null;
    const creator=f?.creator_id||room.created_by,pending=this.pendingClose(sid);
    return {canRequest:room.status==='active'&&!!(f||room.giver_id)&&(!creator||creator===user.id),legacyCreator:!creator,status:room.status,pending:pending?{...pending,votes:this.all('SELECT v.user_id,u.name,v.decision FROM room_close_votes v JOIN users u ON u.id=v.user_id WHERE request_id=?',pending.id)}:null};
  }
  requestClose(user,b){
    const info=this.closureInfo(user,b.space_id);requireThat(info.canRequest,'关闭小窝的申请，由创建人发起哦',403);requireThat(!info.pending,'已经有一份关闭申请在等回复啦',409);requireThat(['unbound','deleted'].includes(b.mode),'这份关闭申请的类型不正确，请刷新重试');
    const sid=this.s.rewardSpaceId(b.space_id),room=this.get('SELECT * FROM spaces WHERE id=?',sid),members=room.family_id?this.members(room.family_id).map(m=>m.user_id):[room.learner_id,room.giver_id],rid=id(),created=now();
    this.run('INSERT INTO room_closures VALUES(?,?,?,?,?,?,?,?)',rid,sid,room.family_id,user.id,b.mode,'pending',created,created);
    for(const uid of members){const mine=uid===user.id,mid=mine?null:this.mail(user,uid,'room_close','想和你商量关闭小窝',{request_id:rid,space_id:sid,mode:b.mode,family:!!room.family_id,room_name:room.family_id?this.get('SELECT name FROM families WHERE id=?',room.family_id).name:'你们的双人小屋'});this.run('INSERT INTO room_close_votes VALUES(?,?,?,?)',rid,uid,mine?'accepted':'pending',mid);}
    this.audit(user,sid,'room.close.request','申请关闭小窝，等待全体同意');
    this.finishClose(user,rid);return {ok:true,request_id:rid};
  }
  finishClose(user,rid){
    const r=this.get('SELECT * FROM room_closures WHERE id=?',rid);if(r.status!=='pending'||this.get("SELECT COUNT(*) n FROM room_close_votes WHERE request_id=? AND decision<>'accepted'",rid).n)return;
    const rooms=this.all(`SELECT id FROM spaces WHERE ${r.family_id?'family_id':'id'}=?`,r.family_id||r.space_id);
    requireThat(!rooms.some(room=>this.s.balance(room.id)<0&&this.get("SELECT id FROM cards WHERE space_id=? AND status IN ('ready','requested') LIMIT 1",room.id)),'还有伙伴的旧卡对应待补余额。先完成计划补足，再同意解散，旧卡才不会被卡住哦',409);
    if(r.family_id)requireThat(this.s.familyPlay.balance(r.family_id)>=0,'共享账户还有待补余额，先补足再关闭小窝吧',409);
    this.run("UPDATE room_closures SET status='accepted',updated=? WHERE id=?",now(),rid);
    this.run(`UPDATE spaces SET status=?,closed_at=? WHERE ${r.family_id?'family_id':'id'}=?`,r.mode,now(),r.family_id||r.space_id);
    if(r.family_id){this.run('UPDATE families SET status=? WHERE id=?',r.mode,r.family_id);this.run('UPDATE invites SET remaining=0 WHERE family_id=?',r.family_id);}
    this.audit(user,r.space_id,'room.close.done','全体已同意，小窝已关闭并移到历史小屋',{mode:r.mode});
    for(const v of this.all('SELECT user_id FROM room_close_votes WHERE request_id=?',rid))this.notice(user,v.user_id,'小屋已经收好啦','所有伙伴都已同意。历史记录保留，已获得的卡仍可完成报销。');
  }
  cancelClose(user,b){
    const r=this.get('SELECT * FROM room_closures WHERE id=?',b.request_id);requireThat(r?.requester_id===user.id&&r.status==='pending','这份申请已结束，或不是你发起的',409);
    this.run("UPDATE room_closures SET status='cancelled',updated=? WHERE id=?",now(),r.id);this.run("UPDATE mailbox SET status='cancelled',updated=? WHERE id IN (SELECT mail_id FROM room_close_votes WHERE request_id=?) AND status='pending'",now(),r.id);
    this.audit(user,r.space_id,'room.close.cancel','撤回了解散申请');return {ok:true};
  }
  friendship(a,b){const [x,y]=[a,b].sort();return this.get('SELECT * FROM friends WHERE user_a=? AND user_b=?',x,y);}
  friendRequest(user,b){
    const username=string(b.username,'朋友的账号',32).toLowerCase(),friend=this.get('SELECT id,name FROM users WHERE username=? AND enabled=1',username);requireThat(friend&&friend.id!==user.id,'填一下朋友的准确账号吧，不能添加自己');requireThat(!this.friendship(user.id,friend.id),'你们已经是好友啦',409);
    requireThat(!this.get("SELECT id FROM mailbox WHERE kind='friend' AND status='pending' AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))",user.id,friend.id,friend.id,user.id),'你们已经有一份好友申请在信箱里啦',409);
    requireThat(this.get("SELECT COUNT(*) n FROM mailbox WHERE sender_id=? AND kind='friend' AND created>?",user.id,new Date(Date.now()-86400_000).toISOString()).n<20,'今天已发出 20 份好友申请，明天再继续认识伙伴吧');
    return {ok:true,id:this.mail(user,friend.id,'friend','想和你成为好友',{})};
  }
  removeFriend(user,b){
    requireThat(this.friendship(user.id,b.user_id),'你们还不是好友',404);const [a,c]=[user.id,b.user_id].sort();this.run('DELETE FROM friends WHERE user_a=? AND user_b=?',a,c);
    this.s.friends.cancelInvites(a,c);
    this.run('UPDATE day_shares SET revoked=1 WHERE (owner_id=? AND viewer_id=?) OR (owner_id=? AND viewer_id=?)',a,c,c,a);
    this.run("UPDATE mailbox SET status='cancelled',updated=? WHERE kind='view_day' AND status='pending' AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))",now(),a,c,c,a);
    return {ok:true};
  }
  viewRequest(user,b){
    requireThat(this.friendship(user.id,b.user_id),'先成为好友，再申请看看这一天吧',403);const day=this.date(b.day);requireThat(['activity','diary','both'].includes(b.scope),'选一下想看的内容');
    const payload={day,scope:b.scope};requireThat(!this.get("SELECT id FROM mailbox WHERE sender_id=? AND recipient_id=? AND kind='view_day' AND status='pending' AND payload=?",user.id,b.user_id,JSON.stringify(payload)),'这一天的申请已经在等回复啦',409);
    requireThat(this.get("SELECT COUNT(*) n FROM mailbox WHERE sender_id=? AND kind='view_day' AND created>?",user.id,new Date(Date.now()-86400_000).toISOString()).n<20,'今天已发出 20 份查看申请，先等朋友回信吧');
    return {ok:true,id:this.mail(user,b.user_id,'view_day','申请看看你的一天',payload)};
  }
  snapshot(userId,day,scope){
    const value={day,scope,name:this.get('SELECT name FROM users WHERE id=?',userId).name};
    if(scope!=='activity')value.diary=this.get('SELECT content,updated FROM diaries WHERE user_id=? AND day=?',userId,day)||null;
    if(scope!=='diary'){
      const start=new Date(day+'T00:00:00+08:00').toISOString(),end=new Date(Date.parse(start)+86400_000).toISOString();
      const rows=this.all(`SELECT action,summary,created FROM room_audit WHERE actor_id=? AND created>=? AND created<? AND action IN (${taskActions.map(()=>'?').join(',')}) ORDER BY seq LIMIT 1001`,userId,start,end,...taskActions);
      value.activity=rows.slice(0,1000);value.truncated=rows.length>1000;
      value.completions=this.all('SELECT t.title,c.done,c.note,c.points FROM completions c JOIN tasks t ON t.id=c.task_id WHERE c.user_id=? AND c.day=? ORDER BY c.updated LIMIT 1000',userId,day).map(c=>({...c,points:c.points/COIN}));
    }return value;
  }
  diary(user,b={}){const day=this.date(b.day||dayAt());return {day,content:this.get('SELECT content FROM diaries WHERE user_id=? AND day=?',user.id,day)?.content||''};}
  saveDiary(user,b){const day=this.date(b.day);requireThat(typeof b.content==='string'&&b.content.length<=8000,'日记最多写 8000 字哦');const current=this.get('SELECT content FROM diaries WHERE user_id=? AND day=?',user.id,day)?.content||'';requireThat(b.expectedContent===current,'这篇日记在别处有了新修改，先重新打开看看吧',409);if(b.content.trim())this.run('INSERT INTO diaries VALUES(?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET content=excluded.content,updated=excluded.updated',user.id,day,b.content.trim(),now());else this.run('DELETE FROM diaries WHERE user_id=? AND day=?',user.id,day);return {ok:true};}
  respond(user,b){
    const m=this.get('SELECT * FROM mailbox WHERE id=? AND recipient_id=?',b.id,user.id);requireThat(m&&m.status==='pending'&&m.kind!=='notice','这封信已处理，或不属于你',409);requireThat(typeof b.accept==='boolean','选择同意或暂不同意吧');const p=JSON.parse(m.payload),decision=b.accept?'accepted':'declined';let result={ok:true};
    if(m.kind==='room_invite'){result=this.s.friends.respondInvite(user,m,b.accept);if(result.space_id)this.run('UPDATE mailbox SET payload=? WHERE id=?',JSON.stringify({...p,space_id:result.space_id}),m.id);}
    if(m.kind==='friend'&&b.accept){const [a,c]=[user.id,m.sender_id].sort();requireThat(this.get('SELECT id FROM users WHERE id=? AND enabled=1',m.sender_id),'对方账号暂时不可用');this.run('INSERT OR IGNORE INTO friends VALUES(?,?,?)',a,c,now());}
    if(m.kind==='view_day'&&b.accept){requireThat(this.friendship(user.id,m.sender_id),'好友关系已结束，这份申请不能继续了',409);const snapshot=this.snapshot(user.id,p.day,p.scope);requireThat(b.snapshotHash===hash(JSON.stringify(snapshot)),'这一天的内容刚有变化，重新预览后再同意吧',409);this.run('INSERT INTO day_shares(id,mail_id,owner_id,viewer_id,day,scope,snapshot,created) VALUES(?,?,?,?,?,?,?,?)',id(),m.id,user.id,m.sender_id,p.day,p.scope,JSON.stringify(snapshot),now());}
    if(m.kind==='room_close'){
      const r=this.get('SELECT * FROM room_closures WHERE id=?',p.request_id);requireThat(r?.status==='pending','这份关闭申请已经结束',409);
      requireThat(this.get("SELECT user_id FROM room_close_votes WHERE request_id=? AND user_id=? AND decision='pending'",r.id,user.id),'你已经答复过这份申请',409);
      this.run('UPDATE room_close_votes SET decision=? WHERE request_id=? AND user_id=?',decision,r.id,user.id);
      this.audit(user,r.space_id,'room.close.vote',b.accept?'同意解散小屋':'暂不同意解散小屋');
      if(!b.accept){this.run("UPDATE room_closures SET status='declined',updated=? WHERE id=?",now(),r.id);this.run("UPDATE mailbox SET status='cancelled',updated=? WHERE id IN (SELECT mail_id FROM room_close_votes WHERE request_id=?) AND status='pending' AND id<>?",now(),r.id,m.id);}
      else this.finishClose(user,r.id);
    }
    this.run('UPDATE mailbox SET status=?,updated=?,read_at=? WHERE id=?',decision,now(),now(),m.id);
    this.notice(user,m.sender_id,b.accept?'收到一份同意啦':'朋友回复了申请',`${user.name}${b.accept?'同意了':'暂不同意'}「${m.subject}」${p.day?'（'+p.day+'）':''}。`);
    return result;
  }
  previewShare(user,b){const m=this.get("SELECT * FROM mailbox WHERE id=? AND recipient_id=? AND kind='view_day' AND status='pending'",b.id,user.id);requireThat(m,'这份申请已经处理，或不属于你',404);requireThat(this.friendship(user.id,m.sender_id),'你们已不是好友',403);const p=JSON.parse(m.payload),snapshot=this.snapshot(user.id,p.day,p.scope);return {snapshot,snapshotHash:hash(JSON.stringify(snapshot))};}
  readShare(user,b){const share=this.get('SELECT * FROM day_shares WHERE id=?',b.id);requireThat(share&&!share.revoked&&[share.owner_id,share.viewer_id].includes(user.id)&&this.friendship(share.owner_id,share.viewer_id),'这份分享未获准、已经撤回或好友关系已结束',403);return {id:share.id,created:share.created,snapshot:JSON.parse(share.snapshot)};}
  revokeShare(user,b){const share=this.get('SELECT * FROM day_shares WHERE id=? AND owner_id=?',b.id,user.id);requireThat(share,'这份分享不属于你',404);this.run('UPDATE day_shares SET revoked=1 WHERE id=?',share.id);return {ok:true};}
  inbox(user,b={}){
    const direction=b.direction==='sent'?'sent':'received',cursor=b.before?integer(Number(b.before),1,Number.MAX_SAFE_INTEGER,'信件位置'):Number.MAX_SAFE_INTEGER;
    const rows=this.all(`SELECT m.rowid AS position,m.*,u.name AS sender_name,u.username AS sender_username,v.name AS recipient_name,v.username AS recipient_username,d.id AS share_id,d.revoked AS share_revoked FROM mailbox m JOIN users u ON u.id=m.sender_id JOIN users v ON v.id=m.recipient_id LEFT JOIN day_shares d ON d.mail_id=m.id WHERE m.${direction==='sent'?'sender_id':'recipient_id'}=? AND m.rowid<? ORDER BY m.rowid DESC LIMIT 51`,user.id,cursor);
    return {entries:rows.slice(0,50).map(r=>({...r,payload:JSON.parse(r.payload)})),next:rows.length>50?rows[49].position:null,direction};
  }
  readMail(user,b){requireThat(Array.isArray(b.ids)&&b.ids.length<=50,'一次最多标记 50 封信');for(const mid of b.ids)this.run('UPDATE mailbox SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_id=?',now(),mid,user.id);return {ok:true};}
  overview(user){
    const friends=this.s.friends.list(user);
    const pending=this.all("SELECT m.id,m.kind,m.subject,m.payload,u.name AS sender_name FROM mailbox m JOIN users u ON u.id=m.sender_id WHERE recipient_id=? AND status='pending' ORDER BY m.rowid LIMIT 20",user.id).map(m=>({...m,payload:JSON.parse(m.payload)}));
    return {friends,pending,chatUnread:friends.reduce((n,f)=>n+f.unread,0),unread:this.get('SELECT COUNT(*) n FROM mailbox WHERE recipient_id=? AND read_at IS NULL',user.id).n,pendingCount:this.get("SELECT COUNT(*) n FROM mailbox WHERE recipient_id=? AND status='pending'",user.id).n};
  }
}
