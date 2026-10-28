import {id,now,hash,string,integer,requireThat} from './store.mjs';

export class Friends {
  constructor(store){this.s=store;}
  friend(user,uid){
    requireThat(typeof uid==='string'&&uid!==user.id&&this.s.community.friendship(user.id,uid),'先成为好友，再来聊天或邀请吧',403);
    const friend=this.s.get('SELECT id,name,username FROM users WHERE id=? AND enabled=1',uid);requireThat(friend,'这位好友暂时不可用',403);return friend;
  }
  list(user){
    return this.s.all(`SELECT u.id,u.name,u.username,
      (SELECT body FROM friend_messages WHERE (sender_id=u.id AND recipient_id=?) OR (sender_id=? AND recipient_id=u.id) ORDER BY seq DESC LIMIT 1) last_message,
      (SELECT created FROM friend_messages WHERE (sender_id=u.id AND recipient_id=?) OR (sender_id=? AND recipient_id=u.id) ORDER BY seq DESC LIMIT 1) last_at,
      (SELECT COUNT(*) FROM friend_messages WHERE sender_id=u.id AND recipient_id=? AND read_at IS NULL) unread
      FROM friends f JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END
      WHERE (f.user_a=? OR f.user_b=?) AND u.enabled=1 ORDER BY last_at DESC,u.name`,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id);
  }
  messages(user,b){
    const friend=this.friend(user,b.user_id);requireThat(!(b.before&&b.after),'一次只向前或向后查看聊天记录');
    const after=b.after!==undefined?integer(Number(b.after),0,Number.MAX_SAFE_INTEGER,'消息位置'):null;
    const before=b.before?integer(Number(b.before),1,Number.MAX_SAFE_INTEGER,'消息位置'):Number.MAX_SAFE_INTEGER;
    const rows=this.s.all(`SELECT seq,id,sender_id,recipient_id,body,created FROM friend_messages WHERE
      ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND seq ${after===null?'<':'>'} ? ORDER BY seq ${after===null?'DESC':'ASC'} LIMIT 51`,user.id,friend.id,friend.id,user.id,after??before);
    const page=rows.slice(0,50);if(after===null)page.reverse();
    return {friend,entries:page,more:rows.length>50,before:after===null&&rows.length>50?page[0].seq:null,after:page.at(-1)?.seq??after??0};
  }
  send(user,b){
    const friend=this.friend(user,b.user_id),body=string(b.body,'消息',2000);
    requireThat(this.s.get('SELECT COUNT(*) n FROM friend_messages WHERE sender_id=? AND created>?',user.id,new Date(Date.now()-60000).toISOString()).n<60,'消息发得有点快，稍等一小会儿再聊吧',429);
    const mid=id();this.s.run('INSERT INTO friend_messages(id,sender_id,recipient_id,body,created) VALUES(?,?,?,?,?)',mid,user.id,friend.id,body,now());
    return {ok:true,message:this.s.get('SELECT seq,id,sender_id,recipient_id,body,created FROM friend_messages WHERE id=?',mid)};
  }
  read(user,b){
    const friend=this.friend(user,b.user_id),through=integer(Number(b.through),0,Number.MAX_SAFE_INTEGER,'消息位置');
    this.s.run('UPDATE friend_messages SET read_at=COALESCE(read_at,?) WHERE sender_id=? AND recipient_id=? AND seq<=?',now(),friend.id,user.id,through);return {ok:true};
  }
  invite(user,b){
    const friend=this.friend(user,b.user_id),direction=b.direction;requireThat(['learner','manager','family'].includes(direction),'选一下想邀请朋友做什么吧');
    const family=direction==='family'?this.s.community.family(user,b.space_id):null;
    if(direction==='family')requireThat(family&&!family.members.some(m=>m.user_id===friend.id),'这位朋友已在家庭里，或还没有选择家庭');
    else {const learner=direction==='learner'?friend.id:user.id,giver=direction==='learner'?user.id:friend.id;requireThat(!this.s.get("SELECT id FROM spaces WHERE learner_id=? AND giver_id=? AND status='active'",learner,giver),'你们已经有这间小屋啦',409);}
    requireThat(!this.s.get('SELECT hash FROM invites WHERE creator_id=? AND recipient_id=? AND direction=? AND family_id IS ? AND remaining>0 AND expires>?',user.id,friend.id,direction,family?.id||null,Date.now()),'这份邀请已经在朋友信箱里啦',409);
    requireThat(this.s.get("SELECT COUNT(*) n FROM mailbox WHERE sender_id=? AND kind='room_invite' AND created>?",user.id,new Date(Date.now()-86400000).toISOString()).n<20,'今天已经寄出 20 份小屋邀请，先等朋友回信吧',429);
    const label=string(b.label||family?.name||'一起慢慢成长','邀请留言',40);
    const r=family?this.s.community.familyInvite(user,b):this.s.invite(user,{direction,label}),key=hash(r.code);
    this.s.run('UPDATE invites SET recipient_id=?,label=? WHERE hash=?',friend.id,label,key);
    const invite=this.s.get('SELECT * FROM invites WHERE hash=?',key),payload={invite_hash:key,direction,label:invite.label,family_name:family?.name||'',expires:invite.expires};
    const mid=this.s.community.mail(user,friend.id,'room_invite',family?'邀请你加入家庭':direction==='learner'?'想给你发奖励':'想请你给我发奖励',payload);
    return {ok:true,mail_id:mid};
  }
  invitation(user,mailId){
    const mail=this.s.get("SELECT * FROM mailbox WHERE id=? AND recipient_id=? AND kind='room_invite' AND status='pending'",mailId,user.id);requireThat(mail,'这份邀请已处理，或不是寄给你的',404);
    this.friend(user,mail.sender_id);const payload=JSON.parse(mail.payload),invite=this.s.get('SELECT * FROM invites WHERE hash=? AND recipient_id=? AND creator_id=?',payload.invite_hash,user.id,mail.sender_id);
    requireThat(invite&&invite.remaining>0&&invite.expires>Date.now(),'这份邀请已过期或已结束，请朋友再寄一份',409);
    if(invite.family_id)this.s.community.previewFamily(user,invite);
    return {mail,invite};
  }
  previewInvite(user,b){const {invite}=this.invitation(user,b.id);return {direction:invite.direction,label:invite.label,expires:invite.expires};}
  respondInvite(user,mail,accept){
    const payload=JSON.parse(mail.payload);let result={ok:true};
    if(accept){const {invite}=this.invitation(user,mail.id);result=this.s.acceptInviteRecord(user,invite);}
    this.s.run('UPDATE invites SET remaining=0 WHERE hash=? AND creator_id=? AND recipient_id=?',payload.invite_hash,mail.sender_id,user.id);return result;
  }
  cancelInvites(a,b){
    this.s.run('UPDATE invites SET remaining=0 WHERE (creator_id=? AND recipient_id=?) OR (creator_id=? AND recipient_id=?)',a,b,b,a);
    this.s.run("UPDATE mailbox SET status='cancelled',updated=? WHERE kind='room_invite' AND status='pending' AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))",now(),a,b,b,a);
  }
}
