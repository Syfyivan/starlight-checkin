import {COIN,dayAt} from './common.mjs';
import {now,hash,integer,requireThat,string} from './store.mjs';
import {scheduledOn,dueOn,taskKind,nextTaskDay} from '../public/task-types.js';
const start=day=>Date.parse(day+'T00:00:00+08:00');
const next=day=>dayAt(start(day)+86400000);

export class TaskPlans {
  constructor(store){this.s=store;}
  editVersion(t){return hash(JSON.stringify([this.s.get('SELECT * FROM tasks WHERE id=?',t.id),this.s.get('SELECT * FROM completions WHERE task_id=? AND day=?',t.id,dayAt()),this.s.scoreVersion(t.space_id)]));}
  edit(user,b){
    const s=this.s,space=s.ownSpace(user,b),t=s.get('SELECT * FROM tasks WHERE id=? AND space_id=? AND user_id=? AND archived=0',b.task_id,space,user.id);
    requireThat(t,'这个计划暂时不能修改',404);requireThat(!t.family_plan_id,'共同计划的安排要保持一致，需要更改时请归档后重新创建');
    requireThat(b.expectedVersion===this.editVersion(t),'计划或打卡记录刚有变化，重新打开编辑再试吧',409);
    const day=dayAt(),kind=b.task_kind,repeat=kind==='repeat'?b.repeat_days:1;
    requireThat(['normal','repeat','long'].includes(kind),'请选择任务类型');requireThat([1,2,7].includes(repeat),'重复周期请选择每天、每两天或每周');
    const start=b.start_date||day,scheduleChanged=kind!==t.task_kind||repeat!==t.repeat_days||start!==t.start_date;
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    requireThat(validDate(start)&&(!scheduleChanged||start>=day),'新安排的开始日期请选今天或之后');
    const c=s.get('SELECT done FROM completions WHERE task_id=? AND day=?',t.id,day);
    const keepsToday=(kind==='long')===(t.task_kind==='long')&&scheduledOn({...t,task_kind:kind,repeat_days:repeat,start_date:start},day);
    requireThat(!scheduleChanged||!c?.done||keepsToday,'今天已经完成啦；切换长期计分或移到其他日期前，先取消本次完成',409);
    const deadline=kind==='long'?(b.deadline||''):'';
    requireThat(!deadline||(validDate(deadline)&&deadline>=start&&(deadline===t.deadline||deadline>=day)),'截止日期请选开始日期之后，且不能新增过去的截止日期');
    requireThat(['学习','运动','生活','工作'].includes(b.category),'请选择任务分类');
    requireThat(['none','urgent-important','urgent-not-important','not-urgent-important','not-urgent-not-important'].includes(b.quadrant),'四象限分类无效');
    requireThat(kind==='long'||t.score_override==null||t.score_override<=100*COIN,'发奖人定分超过普通任务上限，请先请发奖人调整分数');
    const title=string(b.title,'任务',100),score=s.taskScore(space,b,{...t,task_kind:kind}),minutes=integer(b.estimated_minutes??0,0,1440,'预估分钟');
    if(scheduleChanged)s.progress.stop(t.id);
    s.run('UPDATE tasks SET title=?,category=?,points=?,difficulty=?,task_kind=?,recurrence=?,repeat_days=?,start_date=?,deadline=?,quadrant=?,estimated_minutes=?,once_since=?,score_revision=score_revision+1 WHERE id=?',title,b.category,score.points,score.difficulty,kind,kind==='repeat'?'daily':'once',repeat,start,deadline,b.quadrant,minutes,kind!==t.task_kind?day:t.once_since,t.id);
    return {ok:true,bonus:s.syncDailyBonus(space),scheduleChanged};
  }
  visible(space,day){
    const rows=this.s.all(`SELECT t.*,c.done,c.day AS completion_day,c.note,c.points AS awarded,c.difficulty AS completed_difficulty,c.nominal_points,c.updated AS completion_updated,c.score_mode FROM tasks t
      LEFT JOIN completions c ON c.task_id=t.id AND c.day=CASE WHEN t.task_kind='long' THEN COALESCE((SELECT MAX(day) FROM completions WHERE task_id=t.id AND done=1 AND day>=t.once_since AND day<=?),?) ELSE ? END
      WHERE t.space_id=? AND (t.archived=0 OR (c.done=1 AND c.day=?)) AND t.start_date<=?
      AND (t.task_kind IN ('repeat','long') OR NOT EXISTS(SELECT 1 FROM completions WHERE task_id=t.id AND done=1 AND day>=t.once_since AND day<?)) ORDER BY t.created`,day,day,day,space,day,day,day);
    return rows.filter(t=>scheduledOn(t,day)).map(t=>({...t,daily_due:dueOn(t,day)&&!(t.done&&t.completion_day<day)}));
  }
  future(space,day){return this.s.all('SELECT * FROM tasks WHERE space_id=? AND archived=0',space).map(t=>({...t,next_date:nextTaskDay(t,day)})).filter(t=>t.next_date&&(!scheduledOn(t,day)||t.start_date>day)).sort((a,b)=>a.next_date.localeCompare(b.next_date));}
  dailyEarned(space,day,exclude=''){return this.s.get(`SELECT COALESCE(SUM(c.points),0) n FROM completions c JOIN tasks t ON t.id=c.task_id WHERE c.space_id=? AND c.day=? AND c.done=1 AND c.task_kind<>'long' AND t.id<>?`,space,day,exclude).n;}
  award(space,task,score,day){return taskKind(task)==='long'?score.points:Math.min(score.points,Math.max(0,this.s.settings(space).dailyCap*COIN-this.dailyEarned(space,day,task.id)));}
  preview(space,day){
    const end=new Date(start(day)+86400000).toISOString(),begin=new Date(start(day)).toISOString();
    const tasks=this.s.all(`SELECT t.*,c.done FROM tasks t LEFT JOIN completions c ON c.task_id=t.id AND c.day=?
      WHERE t.space_id=? AND t.start_date<=? AND t.created<? AND (t.archived=0 OR t.archived_at>=?)
      AND (t.task_kind='repeat' OR NOT EXISTS(SELECT 1 FROM completions WHERE task_id=t.id AND done=1 AND day>=t.once_since AND day<?))`,day,space,day,end,begin,day).filter(t=>dueOn(t,day));
    const missed=tasks.filter(t=>!t.done).map(t=>({id:t.id,title:t.title,kind:taskKind(t)}));
    const gross=this.s.get('SELECT COALESCE(SUM(points),0) n FROM completions WHERE space_id=? AND day=? AND done=1',space,day).n+(this.s.get("SELECT amount FROM daily_bonuses WHERE space_id=? AND day=? AND active=1 AND kind='coins'",space,day)?.amount||0)*COIN;
    const enabled=this.s.settings(space).penaltyEnabled&&this.s.familyPlay.eligible(space),percent=enabled?Math.min(100,missed.length):0;
    return {day,gross,enabled,total:tasks.length,missed,percent,amount:Number(BigInt(gross)*BigInt(percent)/100n)};
  }
  settle(space,at=Date.now()){
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space);if(!room)return;
    const enabled=this.s.get("SELECT value FROM settings WHERE key='task_settlement_start'")?.value;if(!enabled)return;
    const last=this.s.get('SELECT MAX(day) day FROM task_settlements WHERE space_id=?',space)?.day;
    let day=[enabled,dayAt(Date.parse(room.created)),last?next(last):enabled].sort().pop();
    const until=room.status==='active'?dayAt(at):next(dayAt(Date.parse(room.closed_at||room.created)));
    this.s.db.exec('SAVEPOINT settle_tasks');
    try{
      for(;day<dayAt(at)&&day<until;day=next(day)){
        const p=this.preview(space,day);
        this.s.run('INSERT INTO task_settlements(space_id,day,gross,missed,percent,amount,detail,created) VALUES(?,?,?,?,?,?,?,?)',space,day,p.gross,p.missed.length,p.percent,p.amount,JSON.stringify(p.missed),now());
        if(p.amount){
          this.s.post(space,-p.amount,'daily_penalty',`${day} 未完成 ${p.missed.length} 项 · 当日所得扣 ${p.percent}%`,space+':'+day);
          const owner=this.s.get('SELECT id,name FROM users WHERE id=?',room.learner_id);
          this.s.community.audit(owner,space,'task.daily.settlement','系统结算 · '+day,{gross:p.gross/COIN,missed:p.missed,percent:p.percent,deducted:p.amount/COIN});
        }
      }
      this.s.db.exec('RELEASE settle_tasks');
    }catch(e){this.s.db.exec('ROLLBACK TO settle_tasks; RELEASE settle_tasks');throw e;}
  }
  status(space,day){const latest=this.s.get('SELECT day,gross,missed,percent,amount FROM task_settlements WHERE space_id=? ORDER BY day DESC LIMIT 1',space);return {percentPerTask:1,starts:this.s.get("SELECT value FROM settings WHERE key='task_settlement_start'")?.value,today:this.preview(space,day),latest:latest||null};}
  penalties(user,space){
    const s=this.s;s.admin(user,space,{closed:true});const f=s.community.family(user,space),spaces=f?f.members.map(m=>m.space_id):[space];
    for(const sid of spaces)this.settle(sid);
    return spaces.flatMap(sid=>s.all(`SELECT t.*,u.name,l.id AS debit_id,EXISTS(SELECT 1 FROM ledger r WHERE r.space_id=t.space_id AND r.kind='penalty_refund' AND r.ref='penalty-refund:'||l.id) AS refunded FROM task_settlements t JOIN spaces sp ON sp.id=t.space_id JOIN users u ON u.id=sp.learner_id JOIN ledger l ON l.space_id=t.space_id AND l.kind='daily_penalty' AND l.ref=t.space_id||':'||t.day WHERE t.space_id=? AND t.amount>0 ORDER BY t.day DESC LIMIT 30`,sid)).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,60);
  }
  refund(user,b){
    const s=this.s,space=s.viewSpace(user,b.space_id);s.admin(user,space,{closed:true});requireThat(typeof b.day==='string'&&b.day<dayAt(),'次日结算后才能退回扣分');this.settle(space);
    const settlement=s.get('SELECT * FROM task_settlements WHERE space_id=? AND day=? AND amount>0',space,b.day),debit=s.get("SELECT * FROM ledger WHERE space_id=? AND kind='daily_penalty' AND ref=?",space,space+':'+b.day);
    requireThat(settlement&&debit&&debit.amount===-settlement.amount,'找不到这天的扣分记录',404);
    const ref='penalty-refund:'+debit.id;if(s.get("SELECT id FROM ledger WHERE space_id=? AND kind='penalty_refund' AND ref=?",space,ref))return {ok:true,alreadyRefunded:true};
    s.post(space,settlement.amount,'penalty_refund',b.day+' 未完成扣分已退回',ref);
    s.community.notice(user,s.get('SELECT learner_id FROM spaces WHERE id=?',space).learner_id,'扣掉的学习币回来啦',`${b.day} 扣掉的 ${settlement.amount/COIN} 学习币，${user.name} 已经帮你加回来啦。继续按自己的节奏进步吧！`);
    s.community.audit(user,space,'task.penalty.refund','退回 '+b.day+' 未完成扣分',{day:b.day,coins:settlement.amount/COIN,refund_ref:ref});return {ok:true,amount:settlement.amount};
  }
}
