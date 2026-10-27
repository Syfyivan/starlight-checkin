import {COIN,dayAt} from './common.mjs';
import {now} from './store.mjs';
import {scheduledOn,dueOn,taskKind,nextTaskDay} from '../public/task-types.js';
const start=day=>Date.parse(day+'T00:00:00+08:00');
const next=day=>dayAt(start(day)+86400000);

export class TaskPlans {
  constructor(store){this.s=store;}
  visible(space,day){
    const rows=this.s.all(`SELECT t.*,c.done,c.day AS completion_day,c.note,c.points AS awarded,c.difficulty AS completed_difficulty,c.nominal_points,c.updated AS completion_updated,c.score_mode FROM tasks t
      LEFT JOIN completions c ON c.task_id=t.id AND c.day=CASE WHEN t.task_kind='long' THEN COALESCE((SELECT MAX(day) FROM completions WHERE task_id=t.id AND done=1 AND day<=?),?) ELSE ? END
      WHERE t.space_id=? AND (t.archived=0 OR (c.done=1 AND c.day=?)) AND t.start_date<=?
      AND (t.task_kind IN ('repeat','long') OR NOT EXISTS(SELECT 1 FROM completions WHERE task_id=t.id AND done=1 AND day<?)) ORDER BY t.created`,day,day,day,space,day,day,day);
    return rows.filter(t=>scheduledOn(t,day)).map(t=>({...t,daily_due:dueOn(t,day)&&!(t.done&&t.completion_day<day)}));
  }
  future(space,day){return this.s.all('SELECT * FROM tasks WHERE space_id=? AND archived=0',space).map(t=>({...t,next_date:nextTaskDay(t,day)})).filter(t=>t.next_date&&(!scheduledOn(t,day)||t.start_date>day)).sort((a,b)=>a.next_date.localeCompare(b.next_date));}
  dailyEarned(space,day,exclude=''){return this.s.get(`SELECT COALESCE(SUM(c.points),0) n FROM completions c JOIN tasks t ON t.id=c.task_id WHERE c.space_id=? AND c.day=? AND c.done=1 AND t.task_kind<>'long' AND t.id<>?`,space,day,exclude).n;}
  award(space,task,score,day){return taskKind(task)==='long'?score.points:Math.min(score.points,Math.max(0,this.s.settings(space).dailyCap*COIN-this.dailyEarned(space,day,task.id)));}
  preview(space,day){
    const end=new Date(start(day)+86400000).toISOString(),begin=new Date(start(day)).toISOString();
    const tasks=this.s.all(`SELECT t.*,c.done FROM tasks t LEFT JOIN completions c ON c.task_id=t.id AND c.day=?
      WHERE t.space_id=? AND t.start_date<=? AND t.created<? AND (t.archived=0 OR t.archived_at>=?)
      AND (t.task_kind='repeat' OR NOT EXISTS(SELECT 1 FROM completions WHERE task_id=t.id AND done=1 AND day<?))`,day,space,day,end,begin,day).filter(t=>dueOn(t,day));
    const missed=tasks.filter(t=>!t.done).map(t=>({id:t.id,title:t.title,kind:taskKind(t)}));
    const gross=this.s.get('SELECT COALESCE(SUM(points),0) n FROM completions WHERE space_id=? AND day=? AND done=1',space,day).n+(this.s.get("SELECT amount FROM daily_bonuses WHERE space_id=? AND day=? AND active=1 AND kind='coins'",space,day)?.amount||0)*COIN;
    const percent=Math.min(100,missed.length);
    return {day,gross,total:tasks.length,missed,percent,amount:Math.floor(gross*percent/100)};
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
}
