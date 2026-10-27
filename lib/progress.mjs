import {scheduledOn,taskKind,LONG_POINTS_MAX} from '../public/task-types.js';
import {randomInt} from 'node:crypto';
import {id,now,hash,integer,requireThat} from './store.mjs';
import {COIN,dayAt} from './common.mjs';
import {PET_ITEMS} from './pets.mjs';

export const DEFAULT_GROWTH={enabled:true,step:200,ticket:70,card2:25,card5:5};
const SESSION_LIMIT=4*3600_000;
export const dayStart=day=>Date.parse(day+'T00:00:00+08:00');
const minutes=ms=>Math.round(ms/60000*10)/10;
export class Progress {
  constructor(store){this.s=store;}
  rules(space){const raw=this.s.get('SELECT value FROM growth_rules WHERE space_id=?',this.s.rewardSpaceId(space));const rules=raw?JSON.parse(raw.value):DEFAULT_GROWTH;return {...rules,version:hash(JSON.stringify(rules))};}
  saveRules(user,b){const room=this.s.admin(user,b.space_id),old=this.rules(room);requireThat(b.version===old.version,'成长奖励刚有调整，重新打开后再保存吧',409);requireThat(typeof b.enabled==='boolean','请选择是否开启');const r={enabled:b.enabled,step:integer(b.step,50,100000,'经验间隔'),ticket:integer(b.ticket,0,100,'机会概率'),card2:integer(b.card2,0,100,'2 元卡概率'),card5:integer(b.card5,0,100,'5 元卡概率')};requireThat(r.ticket+r.card2+r.card5===100,'三种奖励的概率加起来需要是 100%');this.s.run('INSERT INTO growth_rules VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value',room,JSON.stringify(r));this.s.community.audit(user,b.space_id,'growth.rules','调整经验来信奖励',{before:old,after:r});return {ok:true};}
  mail(space,kind,key,subject,text,gift=null,metadata={}){
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space);requireThat(room,'小屋不存在',404);
    const recipient=metadata.recipient_id||room.learner_id,manager=this.s.managerId(space)||room.learner_id;
    const existing=this.s.get('SELECT mail_id FROM progress_events WHERE space_id=? AND event_key=? AND recipient_id=?',space,key,recipient);if(existing)return existing.mail_id;
    const sender=this.s.get('SELECT id,name FROM users WHERE id=?',manager),payload={...metadata,text,space_id:space,letterKind:kind};delete payload.recipient_id;
    if(gift)payload.gift={...gift,claimed:false};
    const mid=this.s.community.mail(sender,recipient,'notice',subject,payload,'done');
    this.s.run('INSERT INTO progress_events VALUES(?,?,?,?,?)',space,key,recipient,mid,now());
    if(gift)this.s.run('INSERT INTO mail_gifts(mail_id,space_id,recipient_id,manager_id,gift,threshold,created) VALUES(?,?,?,?,?,?,?)',mid,space,recipient,manager,JSON.stringify(gift),metadata.threshold||0,now());
    return mid;
  }
  sync(space,random=randomInt){
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space);if(!room||room.status!=='active')return;
    const xp=this.s.pets.state(space).xp,old=this.s.get('SELECT high_xp FROM growth_progress WHERE space_id=?',space)?.high_xp||0;
    if(xp<=old)return;
    this.s.run('INSERT INTO growth_progress VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET high_xp=excluded.high_xp',space,xp);
    const r=this.rules(space);if(!r.enabled||(!room.giver_id&&!room.family_id))return;
    for(let threshold=(Math.floor(old/r.step)+1)*r.step;threshold<=xp;threshold+=r.step){
      const roll=random(100),gift=roll<r.ticket?{kind:'ticket',amount:1,title:'好运续杯 · 免费机会'}:{kind:'card',amount:roll<r.ticket+r.card2?200:500,title:roll<r.ticket+r.card2?'2 元随心小糖卡':'5 元随心小云卡'};
      this.mail(space,'milestone','xp:'+threshold,'努力长成了一份小礼物',`累计经验走到了 ${threshold}！每一步都没有白走，信封里给你留了一份小惊喜。`,gift,{threshold});
    }
  }
  claim(user,b){
    const g=this.s.get('SELECT * FROM mail_gifts WHERE mail_id=? AND recipient_id=?',b.mail_id,user.id);requireThat(g,'这份礼物不在你的信箱里',403);
    if(g.claimed_at)return {ok:true,already:true,note:'这份礼物已经收好啦'};
    this.s.ownSpace(user,{space_id:g.space_id},{closed:true});requireThat(this.s.balance(g.space_id)>=0,'先补足学习币待补余额，礼物会替你留好');
    requireThat(!g.threshold||this.s.pets.state(g.space_id).xp>=g.threshold,'经验还没回到这封信的门槛，继续积攒后就能收下');
    let gift=JSON.parse(g.gift);if(gift.kind==='item'&&PET_ITEMS[gift.effect]?.kind==='outfit'&&(this.s.get('SELECT 1 FROM pet_outfits WHERE space_id=? AND effect=?',g.space_id,gift.effect)||this.s.get("SELECT 1 FROM cards WHERE space_id=? AND effect=? AND status='ready'",g.space_id,gift.effect)))gift={kind:'item',effect:'pet_snack',amount:1,title:'一口云朵粮（重复装扮替换）'};let card=null;
    if(gift.kind==='ticket')this.s.postTickets(g.space_id,gift.amount,'mail_gift','收下信中的免费机会',g.mail_id);
    else{
      const item=gift.kind==='item'?PET_ITEMS[gift.effect]:null;requireThat(gift.kind==='card'||item,'礼物内容暂时无法使用');
      const pool=this.s.rewardSpaceId(g.space_id),pid='mail:'+hash(JSON.stringify([pool,gift]));
      const title=gift.title||item?.name||'随心小礼物',face=gift.kind==='card'?gift.amount:0,category=face?'universal':'custom',effect=item?gift.effect:'';
      const description=face?'任意品类的报销额度；可与同屋任一报销品类卡合成，成品沿用该品类。':item.kind==='food'?`使用增加 ${item.xp} 经验，也可以带去旅行。`:`首次解锁增加 ${item.xp} 经验。`;
      this.s.run("INSERT OR IGNORE INTO prizes(id,title,description,emoji,tone,cost,stock,weight,wait_days,active,space_id,category,face_cents,tier,room_id,effect,channel,removed) VALUES(?,?,?,?,?,1,0,0,0,0,?,?,?,'信中礼物',?,?,'shop',1)",pid,title,description,item?.emoji||'🌈',item?'peach':'rainbow',user.id,category,face,pool,effect);
      card=this.s.writeCard(user,{...this.s.get('SELECT * FROM prizes WHERE id=?',pid),lottery_funded:face?1:0},'mail',{space_id:g.space_id,manager_id:g.manager_id,closed:true});
      if(face)this.s.lottery.record(g.space_id,face,'mail_gift',g.mail_id);
    }
    this.s.run('UPDATE mail_gifts SET claimed_at=?,card_id=? WHERE mail_id=?',now(),card?.id||null,g.mail_id);
    const m=this.s.get('SELECT payload FROM mailbox WHERE id=?',g.mail_id),p=JSON.parse(m.payload);p.gift={...gift,claimed:true};this.s.run('UPDATE mailbox SET payload=?,read_at=COALESCE(read_at,?),updated=? WHERE id=?',JSON.stringify(p),now(),now(),g.mail_id);
    this.s.community.audit(user,g.space_id,'mail.gift.claim','收下信中礼物 · '+(gift.title||card?.title||'免费机会'),{gift,card_id:card?.id});return {ok:true,card,note:gift.kind==='ticket'?'免费机会已存好':'小礼物已放进卡包'};
  }
  stop(taskId,at=Date.now()){
    for(const t of this.s.all('SELECT * FROM task_timers WHERE task_id=? AND ended_ms IS NULL',taskId))this.s.run('UPDATE task_timers SET ended_ms=? WHERE id=?',Math.max(t.started_ms,Math.min(at,t.started_ms+SESSION_LIMIT)),t.id);
  }
  timer(user,b,at=Date.now()){
    const space=this.s.ownSpace(user,b),task=this.s.get('SELECT * FROM tasks WHERE id=? AND space_id=?',b.task_id,space);requireThat(task&&!task.archived,'这个任务暂时不能计时',404);
    requireThat(['start','pause'].includes(b.action),'请选择开始或暂停');
    this.expireTimers(at);
    if(b.action==='pause'){this.stop(task.id,at);this.s.community.audit(user,space,'task.timer.pause','暂停专注 · '+task.title,{task_id:task.id});return {ok:true,note:'计时已暂停，努力都记下啦'};}
    requireThat(task.start_date<=dayAt(at),'这个计划还没开始');requireThat(scheduledOn(task,dayAt(at)),'今天不是这个重复任务的计划日');requireThat(!this.s.get('SELECT id FROM completions WHERE task_id=? AND done=1 AND (day=? OR ?=?)',task.id,dayAt(at),task.recurrence,'once'),'已完成的任务不用继续计时啦');
    const running=this.s.get('SELECT * FROM task_timers WHERE user_id=? AND ended_ms IS NULL',user.id);if(running?.task_id===task.id)return {ok:true,note:'已经在计时啦'};
    requireThat(!running,'已有一个任务正在计时，先回到那个小屋暂停它吧',409);
    this.s.run('INSERT INTO task_timers VALUES(?,?,?,?,?,NULL)',id(),task.id,space,user.id,at);
    this.s.community.audit(user,space,'task.timer.start','开始专注 · '+task.title,{task_id:task.id});return {ok:true,note:'开始计时，按自己的节奏来'};
  }
  expireTimers(at=Date.now()){this.s.run('UPDATE task_timers SET ended_ms=started_ms+? WHERE ended_ms IS NULL AND started_ms+?<=?',SESSION_LIMIT,SESSION_LIMIT,at);}
  times(space,day=dayAt(),at=Date.now()){
    const from=dayStart(day),to=from+86400_000,result={};
    for(const t of this.s.all('SELECT * FROM task_timers WHERE space_id=? AND started_ms<? AND (ended_ms IS NULL OR ended_ms>?)',space,to,from)){
      const end=Math.min(t.ended_ms??at,t.started_ms+SESSION_LIMIT,at,to),elapsed=Math.max(0,end-Math.max(from,t.started_ms));
      const r=result[t.task_id]??={elapsed_ms:0,running_since:null};r.elapsed_ms+=elapsed;if(t.ended_ms===null&&at<t.started_ms+SESSION_LIMIT)r.running_since=t.started_ms;
    }return result;
  }
  taskScore(user,b){
    this.s.admin(user,b.space_id);const t=this.s.get('SELECT * FROM tasks WHERE id=? AND space_id=?',b.task_id,b.space_id);requireThat(t&&!t.archived,'任务不存在或已归档',404);requireThat(b.expectedRevision===t.score_revision,'任务分数刚有更新，请刷新后再设置',409);
    const points=b.points===null?null:integer(b.points,1,taskKind(t)==='long'?LONG_POINTS_MAX:100,'任务分数')*COIN;
    this.s.run('UPDATE tasks SET score_override=?,score_revision=score_revision+1 WHERE id=?',points,t.id);
    const c=this.s.get('SELECT * FROM completions WHERE task_id=? AND day=? AND done=1',t.id,dayAt());let amount=0;
    if(c){const fresh={...t,score_override:points},score=this.s.taskScore(b.space_id,{},fresh),award=this.s.plans.award(b.space_id,t,score,dayAt());amount=award-c.points;
      this.s.run('UPDATE completions SET points=?,nominal_points=?,score_mode=?,difficulty=?,updated=? WHERE id=?',award,score.points,score.mode,score.difficulty,now(),c.id);if(amount)this.s.post(b.space_id,amount,'giver_adjust','发奖人调整 · '+t.title,c.id);
    }
    this.s.community.audit(user,b.space_id,'task.score.override','调整任务分数 · '+t.title,{before:t.score_override,after:points,coins:amount/COIN});
    this.mail(b.space_id,'score','score:'+t.id+':'+(t.score_revision+1),'任务分数有个小调整',`「${t.title}」${points===null?'恢复按小屋规则计分':'由发奖人设为 '+points/COIN+' 学习币'}。${c?'今天的已得分已同步调整，余额变化 '+amount/COIN+' 币。':'完成后按新的分数记入。'}`);
    return {ok:true,amount};
  }
  report(space,day,at=Date.now()){
    if(this.s.get('SELECT 1 FROM daily_reports WHERE space_id=? AND day=?',space,day))return;
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space),owner=this.s.get('SELECT id,name FROM users WHERE id=?',room.learner_id),timings=this.times(space,day,at);
    const completions=this.s.all('SELECT t.id,t.title,t.estimated_minutes,c.points,c.done FROM completions c JOIN tasks t ON t.id=c.task_id WHERE c.space_id=? AND c.day=?',space,day),done=completions.filter(t=>t.done);
    if(!completions.length&&!Object.keys(timings).length)return;
    const timed=this.s.all('SELECT id,title,estimated_minutes FROM tasks WHERE space_id=?',space).filter(t=>timings[t.id]);
    const rows=[...done,...timed.filter(t=>!done.some(d=>d.id===t.id))].map(t=>({...t,actual_minutes:minutes(timings[t.id]?.elapsed_ms||0)}));
    const total=minutes(Object.values(timings).reduce((n,t)=>n+t.elapsed_ms,0)),text=rows.map(t=>`${t.done?'✓':'·'} ${t.title} · ${t.actual_minutes?'计时 '+t.actual_minutes+' 分钟':'未计时'}${t.estimated_minutes?' / 预估 '+t.estimated_minutes+' 分钟':''}`).join('\n');
    const settlement=this.s.get('SELECT gross,missed,percent,amount FROM task_settlements WHERE space_id=? AND day=?',space,day);
    const report={day,completed:done.length,total_minutes:total,tasks:rows,settlement:settlement||null};this.s.run('INSERT INTO daily_reports VALUES(?,?,?,?)',space,day,JSON.stringify(report),now());
    const summary=`${day} · 完成 ${done.length} 项，记录了 ${total} 分钟专注。\n\n${text}\n\n`+(settlement?.amount?`当日获得 ${settlement.gross/COIN} 学习币，未完成 ${settlement.missed} 项，扣 ${settlement.percent}%（${settlement.amount/COIN} 币）。经验不扣减。\n\n`:'');
    this.mail(space,'daily','daily:'+day,'今天的努力，替你认真收好',summary+(done.length?'你把想做的事，一件件变成了做到的事。真棒，明天也按自己的节奏来。':'愿意开始，就已经在前进了。今天先好好休息，明天继续一点点。'),null,{day,report});
    const managers=room.family_id?this.s.all('SELECT user_id FROM family_members WHERE family_id=? AND is_admin=1',room.family_id).map(r=>r.user_id):room.giver_id?[room.giver_id]:[];
    for(const uid of managers.filter(uid=>uid!==owner.id))this.mail(space,'daily','daily:'+day,owner.name+' 的今日进展',summary+'这一份坚持，也有你的陪伴。给伙伴一句鼓励吧。',null,{day,report,recipient_id:uid});
  }
  maintain(at=Date.now()){
    this.expireTimers(at);this.s.travel.maintain(at);
    const first=this.s.get("SELECT value FROM settings WHERE key='progress_started_day'")?.value||dayAt(at),today=dayAt(at),from=Math.max(dayStart(first),dayStart(today)-31*86400_000);
    for(const room of this.s.all('SELECT id FROM spaces')){
      this.s.plans.settle(room.id,at);this.sync(room.id);
      for(let t=from;t<dayStart(today);t+=86400_000)this.report(room.id,dayAt(t),at);
    }
  }
}
