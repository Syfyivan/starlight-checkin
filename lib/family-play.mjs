import {id,now,integer,requireThat,string} from './store.mjs';
import {COIN,dayAt} from './common.mjs';
import {scheduledOn} from '../public/task-types.js';

export class FamilyPlay {
  constructor(store){this.s=store;}
  eligible(space){const r=this.s.get(`SELECT f.mode,m.is_admin FROM spaces s JOIN families f ON f.id=s.family_id JOIN family_members m ON m.space_id=s.id WHERE s.id=?`,space);return !r||r.mode!=='guardian'||!r.is_admin;}
  checkManagerOnly(spaces){this.s.credit.requireSettled(spaces,'即将担任家长的伙伴还有借款或分期，请先结清或由另一位管家减免，再切换身份');for(const space of spaces)requireThat(this.s.balance(space)>=0||!this.s.get("SELECT id FROM cards WHERE space_id=? AND shared_family_id IS NULL AND status IN ('ready','requested')",space),'即将担任家长的伙伴还有待补余额，先补足再切换，已有卡片才不会被卡住',409);}
  family(user,space,{active=true}={}){const f=this.s.community.family(user,space);requireThat(f&&f.mode==='friends','共同玩法只在朋友共进家庭开放',403);requireThat(!active||f.status==='active','这个家庭已经收起来了',409);return f;}
  balance(fid){return this.s.get('SELECT COALESCE(SUM(amount),0) n FROM family_ledger WHERE family_id=?',fid).n;}
  post(user,fid,amount,kind,note,ref){requireThat(Number.isSafeInteger(amount),'共享金额超出范围');this.s.run('INSERT INTO family_ledger(id,family_id,actor_id,amount,kind,note,ref,created) VALUES(?,?,?,?,?,?,?,?)',id(),fid,user.id,amount,kind,note,ref,now());}
  mode(user,b){
    const s=this.s,f=s.community.family(user,b.space_id);requireThat(f?.status==='active'&&f.creator_id===user.id,'家庭创建人可以切换相处方式',403);
    requireThat(['classic','friends','guardian'].includes(b.mode),'请选择家庭形式');requireThat(b.expected_mode===f.mode,'家庭形式刚有变化，请刷新后再试',409);
    if(f.mode==='friends'&&b.mode!=='friends')requireThat(!s.get('SELECT id FROM family_plans WHERE family_id=? AND archived=0',f.id)&&this.balance(f.id)===0&&!s.get("SELECT id FROM cards WHERE shared_family_id=? AND status IN ('ready','requested')",f.id)&&!s.get("SELECT id FROM prizes WHERE room_id=? AND reward_scope='shared' AND removed=0",f.pool_space_id),'先归档共同计划、用完共享金币、兑现共同卡片并收起共同奖励，再切换吧',409);
    for(const m of f.members)s.plans.settle(m.space_id);
    if(b.mode==='guardian')this.checkManagerOnly(f.members.filter(m=>m.is_admin).map(m=>m.space_id));
    s.run('UPDATE families SET mode=? WHERE id=?',b.mode,f.id);
    s.community.audit(user,f.pool_space_id,'family.mode','调整家庭形式',{before:f.mode,after:b.mode});
    for(const m of f.members.filter(m=>m.user_id!==user.id))s.community.notice(user,m.user_id,'家里的相处方式更新啦',b.mode==='guardian'?'现在是家长发奖：管家准备奖励，其他家人做任务领奖。':b.mode==='friends'?'现在是朋友共进：各自进步，也能攒共享金币完成共同心愿。':'现在是各自成长：共享奖池，个人计划、币和卡包各自计算。');
    return {ok:true};
  }
  create(user,b){
    const s=this.s,f=this.family(user,b.space_id),members=f.members.filter(m=>b.user_ids?.includes(m.user_id));
    requireThat(Array.isArray(b.user_ids)&&new Set(b.user_ids).size===b.user_ids.length&&members.length===b.user_ids.length&&members.length>=2&&members.some(m=>m.user_id===user.id),'请选择包括自己在内的 2–6 位参与者');
    requireThat(['each','together'].includes(b.mode),'请选择各自完成或一起完成');
    const pid=id(),title=string(b.task?.title,'共同计划',100),bonus=integer(s.settings(f.pool_space_id).sharedBonusCoins,0,1000,'共同加奖')*COIN;
    s.run('INSERT INTO family_plans(id,family_id,creator_id,title,mode,bonus,created) VALUES(?,?,?,?,?,?,?)',pid,f.id,user.id,title,b.mode,bonus,now());
    for(const m of members){const owner=s.get('SELECT * FROM users WHERE id=?',m.user_id),r=s.createTasks(owner,{space_id:m.space_id,tasks:[b.task]});s.run('UPDATE tasks SET family_plan_id=? WHERE id=?',pid,r.ids[0]);}
    s.community.audit(user,f.pool_space_id,'family.plan.create','添加共同计划 · '+title,{mode:b.mode,members:members.map(m=>m.name),bonus:bonus/COIN});return {ok:true,id:pid};
  }
  cycle(t){return t.task_kind==='repeat'?dayAt():'once';}
  done(t){return t.task_kind==='repeat'?!!this.s.get('SELECT id FROM completions WHERE task_id=? AND day=? AND done=1',t.id,dayAt()):!!this.s.get('SELECT id FROM completions WHERE task_id=? AND day>=? AND day<=? AND done=1',t.id,t.once_since,dayAt());}
  sync(user,t){
    if(!t.family_plan_id)return null;const s=this.s,p=s.get('SELECT * FROM family_plans WHERE id=?',t.family_plan_id),tasks=s.all('SELECT * FROM tasks WHERE family_plan_id=?',p.id),cycle=this.cycle(t),eligible=tasks.every(t=>this.done(t)),prior=s.get('SELECT * FROM family_plan_rewards WHERE plan_id=? AND cycle=?',p.id,cycle);
    if(!!prior?.active===eligible)return null;
    const amount=prior?.amount??p.bonus,delta=eligible?amount:-amount;
    s.run('INSERT INTO family_plan_rewards VALUES(?,?,?,?,?) ON CONFLICT(plan_id,cycle) DO UPDATE SET active=excluded.active,updated=excluded.updated',p.id,cycle,amount,eligible?1:0,now());
    this.post(user,p.family_id,delta,eligible?'plan_bonus':'plan_undo',(eligible?'共同完成':'撤回共同加奖')+' · '+p.title,p.id+':'+cycle);
    s.community.audit(user,t.space_id,'family.plan.bonus',(eligible?'共享账户收到加奖':'共享账户撤回加奖')+' · '+p.title,{coins:delta/COIN,cycle});return {amount:delta};
  }
  together(user,b,t){
    const s=this.s,p=s.get('SELECT * FROM family_plans WHERE id=?',t.family_plan_id);this.family(user,t.space_id);requireThat(!p.archived||!b.done,'这个共同计划已经归档');
    let result;
    for(const task of s.all('SELECT * FROM tasks WHERE family_plan_id=? ORDER BY id',p.id)){
      const owner=s.get('SELECT * FROM users WHERE id=?',task.user_id),r=s.complete(owner,{space_id:task.space_id,task_id:task.id,done:b.done,note:`${user.name} 确认一起完成${b.note?'：'+String(b.note).slice(0,900):''}`},{joint:true});
      s.progress.sync(task.space_id);if(task.id===t.id)result=r;
    }
    const shared=this.sync(user,t);s.community.audit(user,t.space_id,'family.plan.together',(b.done?'确认一起完成':'撤销一起完成')+' · '+p.title,{participants:s.all('SELECT user_id FROM tasks WHERE family_plan_id=?',p.id).map(t=>t.user_id)});
    return {...result,shared};
  }
  archive(user,b){const s=this.s,f=this.family(user,b.space_id),p=s.get('SELECT * FROM family_plans WHERE id=? AND family_id=?',b.plan_id,f.id);requireThat(p&&(p.creator_id===user.id||s.canManage(user,b.space_id)),'由计划创建人或奖品管家归档',403);s.run('UPDATE family_plans SET archived=1 WHERE id=?',p.id);for(const t of s.all('SELECT * FROM tasks WHERE family_plan_id=?',p.id)){s.plans.settle(t.space_id);s.progress.stop(t.id);s.run('UPDATE tasks SET archived=1,archived_at=COALESCE(archived_at,?) WHERE id=?',now(),t.id);s.syncDailyBonus(t.space_id);}s.community.audit(user,b.space_id,'family.plan.archive','归档共同计划 · '+p.title);return {ok:true};}
  buy(user,b){const s=this.s,f=this.family(user,b.space_id);s.credit.requireSpend(f.mySpace);const p=s.get("SELECT * FROM prizes WHERE id=? AND room_id=? AND channel='shop' AND reward_scope='shared' AND removed=0 AND active=1 AND stock>0",b.prize_id,f.pool_space_id);requireThat(p&&!p.effect,'这份共同奖励暂时不能兑换',409);requireThat(b.expectedCost===p.cost,'价格刚有变化，请刷新后再试',409);requireThat(this.balance(f.id)>=p.cost,'共享金币还不够，一起完成共同计划来攒吧');s.run('UPDATE prizes SET stock=stock-1 WHERE id=?',p.id);const card=s.writeCard(user,p,'shared',{space_id:f.mySpace});s.run('UPDATE cards SET shared_family_id=? WHERE id=?',f.id,card.id);this.post(user,f.id,-p.cost,'shop','兑换共同奖励 · '+p.title,card.id);s.community.audit(user,f.mySpace,'family.buy','兑换共同奖励 · '+p.title,{coins:-p.cost/COIN,card_id:card.id});return {ok:true,card:{...card,shared_family_id:f.id}};}
  state(user,space){
    const s=this.s,f=s.community.family(user,space);if(f?.mode!=='friends')return null;
    const plans=s.all('SELECT * FROM family_plans WHERE family_id=? AND archived=0 ORDER BY created DESC',f.id).map(p=>{const tasks=s.all('SELECT t.*,u.name FROM tasks t JOIN users u ON u.id=t.user_id WHERE t.family_plan_id=? ORDER BY t.created,t.id',p.id);const cycle=this.cycle(tasks[0]);return {...p,tasks:tasks.map(t=>{const completion=s.get("SELECT day,note,points,done FROM completions WHERE task_id=? AND day>=? AND day<=? AND (?='repeat' AND day=? OR ?<>'repeat') ORDER BY day DESC LIMIT 1",t.id,t.once_since,dayAt(),t.task_kind,dayAt(),t.task_kind);return {...t,points:s.taskScore(t.space_id,{},t).points,completion:completion||null,done:this.done(t),scheduled:scheduledOn(t,dayAt())&&t.start_date<=dayAt()};}),awarded:!!s.get('SELECT active FROM family_plan_rewards WHERE plan_id=? AND cycle=?',p.id,cycle)?.active};});
    return {balance:this.balance(f.id),plans,prizes:s.all("SELECT * FROM prizes WHERE room_id=? AND channel='shop' AND reward_scope='shared' AND removed=0 AND active=1 ORDER BY cost",f.pool_space_id),cards:s.all('SELECT id,user_id,space_id,title,emoji,tone,face_cents,status,available,created,shared_family_id FROM cards WHERE shared_family_id=? ORDER BY created DESC LIMIT 100',f.id),ledger:s.all('SELECT l.*,u.name FROM family_ledger l JOIN users u ON u.id=l.actor_id WHERE family_id=? ORDER BY seq DESC LIMIT 50',f.id)};
  }
}
