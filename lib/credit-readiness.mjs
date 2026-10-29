import {COIN,dayAt} from './common.mjs';
import {dueOn,taskKind} from '../public/task-types.js';

const DAY=86400000;
const midnight=day=>Date.parse(day+'T00:00:00+08:00');
const shift=(day,days)=>dayAt(midnight(day)+days*DAY);
const elapsedDays=(start,end)=>Math.round((midnight(end)-midnight(start))/DAY);
const TIERS=[
  {limitCoins:300,name:'新芽起步',days:0,active:0,rate:0,loans:0},
  {limitCoins:800,name:'慢慢稳定',days:7,active:4,rate:.7,loans:0},
  {limitCoins:1500,name:'稳稳前进',days:14,active:8,rate:.8,loans:0},
  {limitCoins:3000,name:'持续成长',days:28,active:16,rate:.85,loans:0},
  {limitCoins:5000,name:'认真守约',days:28,active:20,rate:.9,loans:1},
];

export class CreditReadiness {
  constructor(store,{clock=Date.now}={}){this.s=store;this.clock=clock;}
  today(){return dayAt(this.clock());}
  trackingSince(space){
    const migration=this.s.get("SELECT value FROM settings WHERE key='credit_readiness_start'")?.value||this.today();
    const room=this.s.get('SELECT created FROM spaces WHERE id=?',space);
    return room?[migration,dayAt(Date.parse(room.created))].sort().at(-1):migration;
  }
  dueTasks(space,day){
    const begin=new Date(midnight(day)).toISOString(),end=new Date(midnight(day)+DAY).toISOString();
    return this.s.all(`SELECT t.* FROM tasks t WHERE t.space_id=? AND t.start_date<=? AND t.created<?
      AND (t.archived=0 OR t.archived_at>=?)
      AND (t.task_kind='repeat' OR NOT EXISTS(SELECT 1 FROM completions c WHERE c.task_id=t.id AND c.done=1 AND c.day>=t.once_since AND c.day<?))`,space,day,end,begin,day)
      .filter(task=>dueOn(task,day)).map(task=>({id:task.id,kind:taskKind(task)}));
  }
  observe(space,day=this.today(),{finalize=false,settlement=null}={}){
    const today=this.today(),prior=this.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',space,day);
    if(prior?.finalized)return prior;
    if(day>today||!this.s.get('SELECT id FROM spaces WHERE id=?',space))return null;
    // A past day can retain an observed task list, but cannot acquire a guessed
    // list from today's edited task definitions. NULL cap marks income-only data.
    const tracking=this.trackingSince(space),live=day===today&&day>=tracking;
    const known=prior?.cap_coins!=null||live;
    const tasks=new Map((prior?JSON.parse(prior.task_ids):[]).map(task=>[task.id,task]));
    if(live)for(const task of this.dueTasks(space,day))if(!tasks.has(task.id))tasks.set(task.id,task);
    const records=this.s.all('SELECT task_id,task_kind,points,done FROM completions WHERE space_id=? AND day=?',space,day);
    const completed=new Set(records.filter(c=>c.done).map(c=>c.task_id));
    const rawEarned=records.filter(c=>c.done&&c.task_kind!=='long').reduce((sum,c)=>sum+Math.max(0,c.points),0);
    const cap=known?(prior?.cap_coins??this.s.settings(space).dailyCap):null;
    const settled=settlement||this.s.get('SELECT amount FROM task_settlements WHERE space_id=? AND day=?',space,day);
    const earned=Math.max(0,Math.min(rawEarned,cap==null?rawEarned:cap*COIN)-(settled?.amount||0));
    const required=known?tasks.size:0,done=known?[...tasks.keys()].filter(id=>completed.has(id)).length:0;
    // Only completed full days are used for eligibility, even when a caller
    // explicitly asks to finalize the current day.
    const frozen=day<today&&(finalize||!live)?1:0,time=new Date(this.clock()).toISOString();
    this.s.run(`INSERT INTO credit_days(space_id,day,task_ids,earned,required_count,completed_count,active,finalized,cap_coins,created,updated)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(space_id,day) DO UPDATE SET task_ids=excluded.task_ids,earned=excluded.earned,required_count=excluded.required_count,
      completed_count=excluded.completed_count,active=excluded.active,finalized=excluded.finalized,cap_coins=excluded.cap_coins,updated=excluded.updated`,
      space,day,JSON.stringify([...tasks.values()]),earned,required,done,known&&(done>0||earned>0)?1:0,frozen,cap,prior?.created||time,time);
    return this.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',space,day);
  }
  profile(space){
    // settle calls observe, never profile; this ordering freezes yesterday after
    // its actual penalty and before a later edit can change any task definition.
    this.s.plans.settle(space,this.clock());
    const today=this.today(),trackingSince=this.trackingSince(space),from=shift(today,-28),fourteen=shift(today,-14);
    for(let day=from;day<today;day=shift(day,1))this.observe(space,day,{finalize:true});
    const rows=this.s.all('SELECT * FROM credit_days WHERE space_id=? AND day>=? AND day<? AND finalized=1 ORDER BY day',space,from,today);
    const observed=rows.filter(row=>row.day>=trackingSince&&row.cap_coins!=null);
    const avg28=Math.floor(rows.reduce((n,row)=>n+row.earned,0)/28),avg14=Math.floor(rows.filter(row=>row.day>=fourteen).reduce((n,row)=>n+row.earned,0)/14);
    const stableDailyIncome=Math.min(avg14,avg28),observedDays=observed.length,activeDays=observed.filter(row=>row.active).length;
    const dueTasks=observed.reduce((n,row)=>n+row.required_count,0),completedTasks=observed.reduce((n,row)=>n+row.completed_count,0),completionRate=dueTasks?Math.min(1,completedTasks/dueTasks):null;
    const contracts=this.s.all('SELECT * FROM credit_contracts WHERE space_id=?',space);
    const onTimeLoans=contracts.filter(c=>c.status==='paid'&&!c.had_overdue&&c.started_on>=trackingSince&&c.closed_on&&elapsedDays(c.started_on,c.closed_on)>=7).length;
    const lateLoans=contracts.filter(c=>c.had_overdue&&(c.status==='active'||c.closed_on>=from)).length;
    const eligible=tier=>observedDays>=tier.days&&activeDays>=tier.active&&(tier.rate===0||completionRate!=null&&completionRate>=tier.rate)&&onTimeLoans>=tier.loans;
    let index=0;TIERS.forEach((tier,i)=>{if(eligible(tier))index=i;});
    const reasons=[];
    if(lateLoans&&index>1){index=1;reasons.push('最近有逾期记录，档位上限暂为 800 币；没有额外罚息。');}
    else if(lateLoans)reasons.push('最近有逾期记录，暂不能提升到 800 币以上；没有额外罚息。');
    if(observedDays<28)reasons.push('完成率从 '+trackingSince+' 开始记录，未观测的旧计划不补猜。');
    if(completionRate==null)reasons.push('还没有已冻结的到期任务记录，暂不计算完成率。');
    if(!stableDailyIncome)reasons.push('先积累普通或重复任务收入；没有稳定收入时，可借额度为 0。');
    reasons.push('按昨天以前 14 / 28 个自然日平均收入的较小值评估，没收入的日子也计入。');
    reasons.push('只计普通和重复任务实际所得，扣除当日扣分；借款、赠币、全勤奖励和长期任务不提高收入能力。');
    const next=TIERS[index+1];let nextTier=null;
    if(next){
      const requirements=[];
      if(observedDays<next.days)requirements.push('近 28 天完整观察日达到 '+next.days+' 天（目前 '+observedDays+' 天）');
      if(activeDays<next.active)requirements.push('近 28 天活跃日达到 '+next.active+' 天（目前 '+activeDays+' 天）');
      if(completionRate==null||completionRate<next.rate)requirements.push('到期任务完成率达到 '+Math.round(next.rate*100)+'%'+(completionRate==null?'（尚无记录）':'（目前 '+Math.floor(completionRate*100)+'%）'));
      if(onTimeLoans<next.loans)requirements.push('至少 1 笔实际占用满 7 天、全额按期偿还的新合同；减免不算履约');
      if(lateLoans&&next.limitCoins>800)requirements.push('最近 28 天没有逾期记录，且进行中的合同无逾期历史');
      nextTier={limitCoins:next.limitCoins,requirements};
    }
    return {assessmentDate:today,repaymentPercent:40,observedDays,activeDays,avg14,avg28,stableDailyIncome,completionRate,dueTasks,completedTasks,tierLimitCoins:TIERS[index].limitCoins,tierName:TIERS[index].name,nextTier,onTimeLoans,lateLoans,reasons,trackingSince};
  }
  capacity(space,{annualBps,periods,periodDays,limitCoins,repaymentPercent=40},profile=this.profile(space)){
    if(![annualBps,periods,periodDays,limitCoins,repaymentPercent].every(Number.isSafeInteger)||annualBps<0||annualBps>1200||periods<1||periods>365||periodDays<1||periodDays>365||limitCoins<0||repaymentPercent<30||repaymentPercent>40)throw new RangeError('Invalid credit capacity terms');
    const periodBudget=Number(BigInt(profile.stableDailyIncome)*BigInt(periodDays)*BigInt(repaymentPercent)/100n);
    const fits=coins=>{
      const principal=coins*COIN,part=Math.floor(principal/periods);
      for(let i=0;i<periods;i++){
        const basis=principal-part*i,repayment=i===periods-1?basis:part;
        const interest=Number(BigInt(basis)*BigInt(annualBps)*BigInt(periodDays)/(10000n*365n));
        if(repayment+interest>periodBudget)return false;
      }return true;
    };
    let lower=0,upper=Math.min(limitCoins,profile.tierLimitCoins);
    while(lower<upper){const middle=Math.floor((lower+upper+1)/2);if(fits(middle))lower=middle;else upper=middle-1;}
    return {maxPrincipalCoins:lower,periodBudget,stableDailyIncome:profile.stableDailyIncome,repaymentPercent,tierLimitCoins:profile.tierLimitCoins,configuredLimitCoins:limitCoins,tierName:profile.tierName,reasons:profile.reasons};
  }
}
