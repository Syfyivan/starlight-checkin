import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID,randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual,randomInt} from 'node:crypto';
import {promisify} from 'node:util';
import {COIN,dayAt} from './common.mjs';
import {Progress} from './progress.mjs';
import {TaskPlans} from './task-plans.mjs';
import {taskKind,scheduledOn,LONG_POINTS_MAX} from '../public/task-types.js';
import {Travel} from './travel.mjs';
import {mergeAmount} from '../public/merge.js';
import {DIFFICULTIES,DEFAULT_SCORES} from './scoring.mjs';
import {migrate} from './migrate.mjs';
import {Community} from './community.mjs';
import {Lottery} from './lottery.mjs';
import {Pets,PET_EFFECTS,PET_TEMPLATES} from './pets.mjs';
import {CATEGORIES,DEFAULT_RATES,TEMPLATES} from './rewards.mjs';
const scrypt=promisify(scryptCallback);
export const hash=s=>createHash('sha256').update(s).digest('hex');
export class Fault extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const requireThat=(ok,message,status=400)=>{if(!ok)throw new Fault(message,status);};
export const id=()=>randomUUID();
export const now=()=>new Date().toISOString();
export function string(value,label,max=120) {requireThat(typeof value==='string' && value.trim().length>0 && value.trim().length<=max,`${label}需填写 1–${max} 个字符`);return value.trim();}
export const normalizeInviteCode=value=>string(value,'配对邀请码',100).replace(/[\s-]/g,'').toLowerCase();
export function integer(value,min,max,label='数值') {requireThat(Number.isSafeInteger(value)&&value>=min&&value<=max,`${label}需为 ${min}–${max} 的整数`);return value;}
export async function passwordHash(password) {requireThat(typeof password==='string'&&password.length>=10&&password.length<=128,'密码需要 10–128 个字符');const salt=randomBytes(16).toString('hex');return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;}
export async function passwordMatches(password,stored) {if(typeof password!=='string'||password.length>128)return false;let [salt,key]=String(stored||'').split(':');const usable=/^[a-f0-9]{32}$/.test(salt)&&/^[a-f0-9]{128}$/.test(key);if(!usable){salt='0'.repeat(32);key='0'.repeat(128);}const v=await scrypt(password,salt,64);return timingSafeEqual(v,Buffer.from(key,'hex'))&&usable;}
export class Store {
  constructor(path) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);this.db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
    this.db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('main',JSON.stringify({spaceName:'小小成就',coinName:'学习币',dailyCap:100,drawCost:20,drawLimit:5,blankWeight:60,marketThreshold:500}));
    migrate(this.db);this.community=new Community(this);this.lottery=new Lottery(this);this.pets=new Pets(this);this.progress=new Progress(this);this.travel=new Travel(this);this.plans=new TaskPlans(this);
  }
  get(sql,...args){return this.db.prepare(sql).get(...args);}
  all(sql,...args){return this.db.prepare(sql).all(...args);}
  run(sql,...args){return this.db.prepare(sql).run(...args);}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  settings(spaceId){
    const room=this.get('SELECT giver_id,legacy_self,family_id FROM spaces WHERE id=?',spaceId||'');
    const saved=JSON.parse(this.get('SELECT value FROM room_settings WHERE space_id=?',this.rewardSpaceId(spaceId)||'')?.value||'{}');
    const rates={...DEFAULT_RATES,...saved.rates};if(saved.rates&&!Object.hasOwn(saved.rates,'healthy'))rates.healthy=Math.round((rates.sport+rates.essentials)/2);
    const paired=room?.giver_id||room?.legacy_self||room?.family_id;
    return {...JSON.parse(this.get("SELECT value FROM settings WHERE key='main'").value),dailyBonusKind:paired?'ticket':'none',dailyBonusAmount:1,taskScoreMode:paired?'difficulty':'manual',defaultDifficulty:'standard',defaultPoints:20,...saved,rates,difficultyPoints:{...DEFAULT_SCORES,...saved.difficultyPoints}};
  }
  scoreVersion(spaceId){const s=this.settings(spaceId);return hash(JSON.stringify([s.taskScoreMode,s.defaultDifficulty,s.defaultPoints,s.difficultyPoints,s.dailyCap]));}
  taskScore(spaceId,input,task={}){
    if(task.score_override!=null)return {points:task.score_override,difficulty:'',mode:'fixed'};
    if(taskKind(task)==='long')return {points:integer(input.points??(task.points!==undefined?task.points/COIN:1000),1,LONG_POINTS_MAX,'长期奖励')*COIN,difficulty:'',mode:'long'};
    const settings=this.settings(spaceId);
    if(settings.taskScoreMode==='difficulty'){
      const difficulty=input.difficulty||task.difficulty||settings.defaultDifficulty;
      requireThat(DIFFICULTIES.some(d=>d.id===difficulty),'请选择一个有效的投入等级');
      return {points:settings.difficultyPoints[difficulty]*COIN,difficulty,mode:'difficulty'};
    }
    return {points:integer(input.points??(task.points!==undefined?task.points/COIN:settings.defaultPoints),1,100,'任务分数')*COIN,difficulty:'',mode:'manual'};
  }
  balance(spaceId){return this.get('SELECT COALESCE(SUM(amount),0) AS balance FROM ledger WHERE space_id=?',spaceId).balance;}
  post(spaceId,amount,kind,note,ref){requireThat(Number.isSafeInteger(amount),'账本金额超出范围');const room=this.get('SELECT learner_id FROM spaces WHERE id=?',spaceId);requireThat(room,'小屋不存在',404);this.run('INSERT INTO ledger(id,user_id,space_id,amount,kind,note,ref,created) VALUES(?,?,?,?,?,?,?,?)',id(),room.learner_id,spaceId,amount,kind,note,ref,now());}
  ticketBalance(spaceId){return this.get('SELECT COALESCE(SUM(amount),0) balance FROM ticket_ledger WHERE space_id=?',spaceId).balance;}
  postTickets(spaceId,amount,kind,note,ref){integer(amount,-1000,1000,'抽奖机会变动');this.run('INSERT INTO ticket_ledger(id,space_id,amount,kind,note,ref,created) VALUES(?,?,?,?,?,?,?)',id(),spaceId,amount,kind,note,ref,now());}
  todayTasks(spaceId,day=dayAt()){
    return this.plans.visible(spaceId,day);
  }
  dailyBonus(spaceId,day=dayAt(),tasks=this.todayTasks(spaceId,day)){
    tasks=tasks.filter(t=>t.daily_due!==false);
    const award=this.get('SELECT * FROM daily_bonuses WHERE space_id=? AND day=?',spaceId,day),s=this.settings(spaceId);
    const kind=award?.kind||s.dailyBonusKind,amount=award?.amount||s.dailyBonusAmount,done=tasks.filter(t=>t.done).length;
    return {day,kind,amount,total:tasks.length,done,eligible:kind!=='none'&&tasks.length>0&&done===tasks.length,active:!!award?.active,previouslyAwarded:!!award};
  }
  syncDailyBonus(spaceId){
    const bonus=this.dailyBonus(spaceId);
    if(bonus.active===bonus.eligible)return null;
    const delta=bonus.eligible?bonus.amount:-bonus.amount,ref=spaceId+':'+bonus.day,kind=bonus.eligible?'daily_bonus':'daily_bonus_undo';
    const note=(bonus.eligible?(bonus.previouslyAwarded?'恢复':'获得'):'收回')+'今日全勤奖励 · '+bonus.day;
    this.run('INSERT INTO daily_bonuses(space_id,day,kind,amount,active,created,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(space_id,day) DO UPDATE SET active=excluded.active,updated=excluded.updated',spaceId,bonus.day,bonus.kind,bonus.amount,bonus.eligible?1:0,now(),now());
    if(bonus.kind==='coins')this.post(spaceId,delta*COIN,kind,note,ref);else this.postTickets(spaceId,delta,kind,note,ref);
    return {kind:bonus.kind,amount:delta,restored:bonus.eligible&&bonus.previouslyAwarded};
  }
  claimDailyBonus(user,body){const spaceId=this.ownSpace(user,body);requireThat(this.dailyBonus(spaceId).eligible,'先完成今天的小计划，再来收下全勤奖励吧');return {ok:true,bonus:this.syncDailyBonus(spaceId)};}
  replay(user,key,action,body){string(key,'请求编号',100);const prior=this.get('SELECT * FROM operations WHERE user_id=? AND key=?',user.id,key);if(!prior)return null;requireThat(prior.action===action&&prior.fingerprint===hash(JSON.stringify(body)),'请求编号已用于不同操作',409);return JSON.parse(prior.result);}
  operation(user,key,action,body,fn){return this.tx(()=>{const old=this.replay(user,key,action,body);if(old)return old;const before=this.community.before(user,action,body),result=fn()||{ok:true};this.community.after(user,action,body,result,before);if(before?.spaceId)this.progress.sync(before.spaceId);this.run('INSERT INTO operations VALUES(?,?,?,?,?)',user.id,key,action,hash(JSON.stringify(body)),JSON.stringify(result));return result;});}
  personalSpaceId(userId){return this.get('SELECT id FROM spaces WHERE learner_id=? AND giver_id IS NULL AND family_id IS NULL',userId)?.id;}
  rewardSpaceId(spaceId){const r=this.get('SELECT family_id FROM spaces WHERE id=?',spaceId||'');return r?.family_id?this.get('SELECT pool_space_id FROM families WHERE id=?',r.family_id)?.pool_space_id:spaceId;}
  rewardOwnerSpace(user,spaceId){const r=this.get('SELECT family_id FROM spaces WHERE id=?',spaceId||'');return r?.family_id?this.get('SELECT space_id FROM family_members WHERE family_id=? AND user_id=?',r.family_id,user.id)?.space_id:spaceId;}
  managerId(spaceId){const r=this.get('SELECT * FROM spaces WHERE id=?',spaceId);if(r?.family_id)return this.get('SELECT user_id FROM family_members WHERE family_id=? AND is_admin=1 ORDER BY created,user_id LIMIT 1',r.family_id)?.user_id||null;return r?.giver_id||null;}
  canManage(user,spaceId,{closed=false}={}){const r=this.get('SELECT * FROM spaces WHERE id=?',spaceId);if(!r||(!closed&&r.status!=='active'))return false;if(r.family_id)return !!this.get('SELECT user_id FROM family_members WHERE family_id=? AND user_id=? AND is_admin=1',r.family_id,user.id);return r.giver_id===user.id||(!r.giver_id&&r.legacy_self===1&&r.learner_id===user.id);}
  admin(user,spaceId,options){requireThat(typeof spaceId==='string'&&this.canManage(user,spaceId,options),'这间小屋的奖励由发奖人或家庭奖品管家来安排哦',403);return this.rewardSpaceId(spaceId);}
  viewSpace(user,spaceId){spaceId=spaceId||user.space_id||this.personalSpaceId(user.id);const room=this.get('SELECT * FROM spaces WHERE id=?',spaceId);requireThat(room&&(room.learner_id===user.id||room.giver_id===user.id||(room.family_id&&this.get('SELECT user_id FROM family_members WHERE family_id=? AND user_id=?',room.family_id,user.id))),'这间小屋没有向你开放',403);return spaceId;}
  ownSpace(user,body={}, {closed=false}={}){const spaceId=this.viewSpace(user,body.space_id||user.space_id),room=this.get('SELECT * FROM spaces WHERE id=?',spaceId);requireThat(room.learner_id===user.id,'计划和卡片由这间小屋的领奖人操作哦',403);requireThat(closed||room.status==='active','这间小屋已经收起来了，仍可查看记录和兑现旧卡',409);this.plans.settle(spaceId);return spaceId;}
  pair(learnerId,managerId,creatorId=learnerId){
    requireThat(learnerId!==managerId,'邀请一位朋友吧，不能和自己配对哦');
    requireThat(this.get('SELECT id FROM users WHERE id=? AND enabled=1',managerId)&&this.get('SELECT id FROM users WHERE id=? AND enabled=1',learnerId),'这个伙伴的账号暂时不可用');
    requireThat(!this.get("SELECT id FROM spaces WHERE learner_id=? AND giver_id=? AND status='active'",learnerId,managerId),'你们已经有这间小屋啦，可以从小屋列表进入',409);
    const spaceId=id();this.run('INSERT INTO spaces(id,learner_id,giver_id,created,created_by) VALUES(?,?,?,?,?)',spaceId,learnerId,managerId,now(),creatorId);
    this.community.audit(this.get('SELECT id,name FROM users WHERE id=?',creatorId),spaceId,'room.create','建立双人小屋');return {ok:true,space_id:spaceId};
  }
  acceptInvite(user,code){const invite=this.get('SELECT * FROM invites WHERE hash=?',hash(normalizeInviteCode(code)));if(invite?.family_id)return this.community.joinFamily(user,invite);requireThat(invite&&invite.creator_id&&invite.remaining>0&&invite.expires>Date.now(),'邀请码已用过或过期啦，请朋友再发一张邀请');const learner=invite.direction==='manager'?invite.creator_id:user.id,manager=invite.direction==='manager'?user.id:invite.creator_id;const result=this.pair(learner,manager,invite.creator_id);this.run('UPDATE invites SET remaining=remaining-1 WHERE hash=?',invite.hash);this.community.audit(user,result.space_id,'room.join','确认小屋邀请');return result;}
  newUser({username,name,password,role='member'}) {
    username=string(username,'账号',32).toLowerCase();requireThat(/^[a-z0-9_]{3,32}$/.test(username),'账号用 3–32 位字母、数字或下划线');
    requireThat(!this.get('SELECT id FROM users WHERE username=?',username),'这个账号已经有人使用',409);
    const u={id:id(),username,name:string(name,'昵称',24),role};this.run('INSERT INTO users(id,username,name,password,role,created) VALUES(?,?,?,?,?,?)',u.id,username,u.name,password,role,now());this.run('INSERT INTO spaces(id,learner_id,created,created_by) VALUES(?,?,?,?)',u.id,u.id,now(),u.id);return u;
  }
  session(userId) {const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');this.run('DELETE FROM sessions WHERE expires<?',Date.now());this.run('INSERT INTO sessions VALUES(?,?,?,?)',hash(token),userId,csrf,Date.now()+14*86400_000);return {token,csrf};}
  authenticate(token) {return this.get('SELECT u.id,u.name,u.username,u.role,u.email,u.email_verified,u.github_login,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.enabled=1',hash(token||''),Date.now());}
  createTasks(user,body) {
    const spaceId=this.ownSpace(user,body);
    requireThat(Array.isArray(body.tasks)&&body.tasks.length>0&&body.tasks.length<=50,'一次可创建 1–50 个任务');
    requireThat(this.get('SELECT COUNT(*) n FROM tasks WHERE space_id=? AND archived=0',spaceId).n+body.tasks.length<=150,'最多保留 150 个进行中的任务');
    const created=[];
    for(const t of body.tasks){const kind=taskKind(t);requireThat(['normal','repeat','long'].includes(kind),'请选择任务类型');
      requireThat(t.task_kind||['daily','once'].includes(t.recurrence),'请选择重复方式');
      const repeat=kind==='repeat'?(t.repeat_days??1):1;requireThat([1,2,7].includes(repeat),'重复周期请选择每天、每两天或每周');
      const title=string(t.title,'任务',100),score=this.taskScore(spaceId,t,{task_kind:kind}),category=['学习','运动','生活','工作'].includes(t.category)?t.category:'学习';
      const start=t.start_date||dayAt();requireThat(/^\d{4}-\d{2}-\d{2}$/.test(start)&&!Number.isNaN(Date.parse(start))&&new Date(start).toISOString().slice(0,10)===start&&start>=dayAt(),'任务日期需为今天或之后的有效日期');
      const deadline=kind==='long'?(t.deadline||''):'';requireThat(!deadline||(/^\d{4}-\d{2}-\d{2}$/.test(deadline)&&!Number.isNaN(Date.parse(deadline))&&new Date(deadline).toISOString().slice(0,10)===deadline&&deadline>=start),'截止日期不能早于开始日期');
      const quadrant=t.quadrant||'none';requireThat(['none','urgent-important','urgent-not-important','not-urgent-important','not-urgent-not-important'].includes(quadrant),'四象限分类无效');
      const minutes=integer(t.estimated_minutes??0,0,1440,'预估分钟');
      const tid=id();this.run('INSERT INTO tasks(id,user_id,title,category,points,recurrence,start_date,created,quadrant,space_id,difficulty,estimated_minutes,task_kind,repeat_days,deadline) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',tid,user.id,title,category,score.points,kind==='repeat'?'daily':'once',start,now(),quadrant,spaceId,score.difficulty,minutes,kind,repeat,deadline);created.push(tid);
    }return {ok:true,ids:created,bonus:this.syncDailyBonus(spaceId)};
  }
  estimateTask(user,body){
    const space=this.ownSpace(user,body),task=this.get('SELECT id,estimated_minutes FROM tasks WHERE id=? AND space_id=? AND archived=0',body.task_id,space);
    requireThat(task,'这个计划暂时不能修改',404);
    requireThat(body.expectedMinutes===task.estimated_minutes,'预估时间刚有变化，请刷新后再试',409);
    const minutes=integer(body.estimated_minutes,0,1440,'预估分钟');
    this.run('UPDATE tasks SET estimated_minutes=? WHERE id=?',minutes,task.id);
    return {ok:true,previousMinutes:task.estimated_minutes,estimated_minutes:minutes};
  }
  complete(user,body){
    const spaceId=this.ownSpace(user,body),t=this.get('SELECT * FROM tasks WHERE id=? AND user_id=? AND space_id=?',body.task_id,user.id,spaceId);requireThat(t,'任务不存在',404);
    const day=body.day||dayAt();requireThat(day===dayAt(),'只能更改今天的打卡状态');requireThat(typeof body.done==='boolean','完成状态无效');
    const c=this.get('SELECT * FROM completions WHERE task_id=? AND day=?',t.id,day),rescore=body.rescore===true;
    if(rescore){requireThat(body.done&&c?.done,'先完成任务，再修改本次分数');requireThat(body.expectedUpdated===c.updated&&body.expectedPoints===c.points,'这次得分已更新，请重新打开后修改',409);}
    if(!rescore&&!!c?.done===body.done){if(c&&body.done&&typeof body.note==='string')this.run('UPDATE completions SET note=?,updated=? WHERE id=?',body.note.slice(0,1000),now(),c.id);return {ok:true,amount:0,bonus:this.syncDailyBonus(spaceId)};}
    requireThat(t.start_date<=day,'该任务今天尚未开始');requireThat(scheduledOn(t,day),'今天不是这个重复任务的计划日');
    if(body.done&&t.recurrence==='once')requireThat(!this.get('SELECT id FROM completions WHERE task_id=? AND done=1 AND day<>?',t.id,day),'这个单次计划已经完成');
    let score={points:c?.nominal_points??t.points,difficulty:c?.difficulty||'',mode:c?.score_mode||'manual'},points=c?.points??0;
    if(body.done){
      if(body.expectedTaskRevision!==undefined)requireThat(body.expectedTaskRevision===t.score_revision,'发奖人刚调整了这个任务的分数，请重新打开确认',409);
      requireThat(!t.archived,'任务已归档');if(body.scoreVersion!==undefined)requireThat(body.scoreVersion===this.scoreVersion(spaceId),'发奖人调整了计分规则，请重新打开确认',409);
      score=this.taskScore(spaceId,body,t);
      if(!rescore&&c&&!Object.hasOwn(body,'points')&&!body.difficulty&&c.score_mode===score.mode)score=['manual','long'].includes(score.mode)?{points:c.nominal_points,difficulty:'',mode:score.mode}:this.taskScore(spaceId,{difficulty:c.difficulty||t.difficulty},t);
      points=this.plans.award(spaceId,t,score,day);
    }
    if(body.done)this.progress.stop(t.id);
    const cid=c?.id||id(),amount=body.done?points-(c?.done?c.points:0):-points;
    this.run('INSERT INTO completions(id,task_id,user_id,day,points,done,note,updated,space_id,difficulty,score_mode,nominal_points) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id,day) DO UPDATE SET points=excluded.points,done=excluded.done,note=excluded.note,updated=excluded.updated,difficulty=excluded.difficulty,score_mode=excluded.score_mode,nominal_points=excluded.nominal_points',cid,t.id,user.id,day,points,body.done?1:0,typeof body.note==='string'?body.note.slice(0,1000):c?.note||'',now(),spaceId,score.difficulty,score.mode,score.points);
    if(amount)this.post(spaceId,amount,rescore?'task_adjust':body.done?'task':'undo',(rescore?'调整得分':body.done?'完成':'撤销')+' · '+t.title,cid);
    return {ok:true,amount,celebrate:body.done&&!c?.done&&!rescore,awarded:body.done?points:0,nominal:score.points,difficulty:score.difficulty,scoreMode:score.mode,capped:body.done&&points<score.points,rescore,bonus:this.syncDailyBonus(spaceId)};
  }
  archive(user,body){const spaceId=this.ownSpace(user,body);const t=this.get('SELECT id FROM tasks WHERE id=? AND user_id=? AND space_id=?',body.task_id,user.id,spaceId);requireThat(t,'任务不存在',404);this.progress.stop(t.id);this.run('UPDATE tasks SET archived=1,archived_at=COALESCE(archived_at,?) WHERE id=?',now(),t.id);return {ok:true,bonus:this.syncDailyBonus(spaceId)};}
  pool(spaceId){spaceId=this.rewardSpaceId(spaceId);const s=this.settings(spaceId),p=this.all("SELECT * FROM prizes WHERE room_id=? AND removed=0 AND active=1 AND channel='lottery' AND stock>0 AND weight>0 ORDER BY id",spaceId||'');const sum=p.reduce((a,p)=>a+p.weight,0),blank=s.fixedOdds?Math.max(0,10000-sum):s.blankWeight,total=s.fixedOdds?10000:blank+sum;return [{id:null,title:'下次好运',emoji:'☘️',weight:blank,probability:blank/total},...p.map(p=>({...p,probability:p.weight/total}))];}
  writeCard(user,prize,source,{manager_id,available,face_cents,title,space_id,closed=false}={}){
    const spaceId=this.ownSpace(user,{space_id:space_id||this.rewardOwnerSpace(user,prize.room_id)},{closed});
    const cid=id();this.run('INSERT INTO cards(id,user_id,prize_id,title,description,emoji,tone,source,available,created,manager_id,category,face_cents,tier,space_id,effect,lottery_funded) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',cid,user.id,prize.id,title||prize.title,prize.description,prize.emoji,prize.tone,source,available||new Date(Date.now()+prize.wait_days*86400_000).toISOString(),now(),manager_id||this.managerId(spaceId)||user.id,prize.category,face_cents??prize.face_cents,prize.tier,spaceId,prize.effect||'',prize.lottery_funded||0);return this.get('SELECT * FROM cards WHERE id=?',cid);
  }
  issue(user,prize,source){requireThat(prize,'这张心愿卡暂时找不到啦',404);const spaceId=this.ownSpace(user,{space_id:this.rewardOwnerSpace(user,prize.room_id)});requireThat(!prize.removed&&prize.active&&prize.stock>0,'这份心愿已被领完或暂时收起来啦',409);requireThat(this.managerId(spaceId)||this.canManage(user,spaceId),'邀请一位发奖人，一起准备心愿吧');this.run('UPDATE prizes SET stock=stock-1 WHERE id=? AND stock>0',prize.id);return this.writeCard(user,prize,source,{space_id:spaceId});}
  buy(user,body){const spaceId=this.ownSpace(user,body);const p=this.get('SELECT * FROM prizes WHERE id=? AND room_id=?',body.prize_id,this.rewardSpaceId(spaceId));requireThat(p,'奖品不存在',404);requireThat(p.channel==='shop','这份奖励只能在抽奖中获得，不能从商城购买',404);if(body.expectedCost!==undefined)requireThat(body.expectedCost===p.cost,'奖品价格已更新，请关闭弹窗并刷新后重试',409);this.pets.canBuy(spaceId,p.effect);requireThat(this.balance(spaceId)>=p.cost,'学习币不足');const card=this.issue(user,p,'shop');this.post(spaceId,-p.cost,'shop',`兑换 · ${p.title}`,card.id);return {ok:true,card};}
  draw(user,body,random=randomInt){const spaceId=this.ownSpace(user,body),s=this.settings(spaceId),mode=body.mode||'coins';requireThat(['coins','ticket'].includes(mode),'选一下用学习币还是免费机会来抽吧');const free=mode==='ticket';if(!free&&body.expectedCost!==undefined)requireThat(body.expectedCost===s.drawCost,'抽奖花费已更新，请关闭弹窗并刷新后重试',409);if(body.poolVersion!==undefined)requireThat(body.poolVersion===hash(JSON.stringify(this.pool(spaceId))),'奖池概率已更新，请关闭弹窗并刷新后重试',409);
    if(free){requireThat(this.balance(spaceId)>=0,'先补足学习币待补余额，再来接住小幸运吧');requireThat(this.ticketBalance(spaceId)>0,'免费机会还不够，完成全天计划再来吧');}
    else{requireThat(this.balance(spaceId)>=s.drawCost*COIN,'学习币不足');requireThat(this.get('SELECT COUNT(*) n FROM draws WHERE space_id=? AND day=? AND cost>0',spaceId,dayAt()).n<s.drawLimit,'今天的学习币抽奖次数已用完，免费机会仍可使用');}
    const pool=this.pool(spaceId);requireThat(pool.length>1,'奖池暂时没有可用奖品');const report=this.lottery.report(spaceId,pool);requireThat(!report.blocked,report.blocked,409);let pick=random(pool.reduce((a,p)=>a+p.weight,0)),chosen=pool[0];for(const p of pool){if(pick<p.weight){chosen=p;break;}pick-=p.weight;}
    const did=id(),card=chosen.id?this.lottery.award(user,chosen,spaceId):null,note=card?`抽奖 · ${card.title}`:'抽奖 · 下次好运';if(free)this.postTickets(spaceId,-1,'draw',note,did);else this.post(spaceId,-s.drawCost*COIN,'draw',note,did);
    this.run('INSERT INTO draws(id,user_id,prize_id,card_id,cost,odds,created,day,space_id) VALUES(?,?,?,?,?,?,?,?,?)',did,user.id,chosen.id,card?.id||null,free?0:s.drawCost*COIN,JSON.stringify(pool.map(p=>({id:p.id,title:p.title,probability:p.probability}))),now(),dayAt(),spaceId);return {ok:true,card,mode};
  }
  moveCards(user,b,kind){
    const spaceId=this.ownSpace(user,b);
    requireThat(this.balance(spaceId)>=0,'请先补足撤销任务产生的待补余额');
    requireThat(Array.isArray(b.card_ids)&&b.card_ids.length>=(kind==='merge'?2:1)&&b.card_ids.length<=20&&new Set(b.card_ids).size===b.card_ids.length,'请选择不重复的卡片，合成至少两张');
    const cards=b.card_ids.map(cid=>this.get('SELECT * FROM cards WHERE id=? AND user_id=? AND space_id=?',cid,user.id,spaceId));
    requireThat(cards.every(c=>c&&c.status==='ready'&&c.face_cents>0),'只能使用未申请、未核销的额度卡',409);
    const roots=cards.flatMap(c=>{const r=JSON.parse(c.merge_roots||'[]');return r.length?r:[c.id];});
    if(kind==='merge')requireThat(new Set(roots).size===roots.length,'这些卡片来自同一张拆分卡，不能再合成赚取加成');
    const first=cards[0],categories=[...new Set(cards.filter(c=>c.category!=='universal').map(c=>c.category))];requireThat(categories.length<=1&&cards.every(c=>c.manager_id===first.manager_id||this.get('SELECT family_id FROM spaces WHERE id=?',spaceId).family_id),'普通卡需同品类；万能卡可加入任一品类，但必须属于同一小屋与发奖人');
    const total=cards.reduce((sum,c)=>sum+c.face_cents,0);integer(total,1,100_000_000,'总额度');
    let category=categories[0]||'universal',amount=kind==='merge'?mergeAmount(cards.map(c=>c.face_cents)):total;
    integer(amount,1,100_000_000,'合成后额度');
    if(kind==='convert'){requireThat(first.category==='universal'&&cards.length===1,'请选择一张万能心愿卡');requireThat(CATEGORIES.some(c=>c.id===b.category)&&!['universal','custom'].includes(b.category),'请选择一种报销品类');category=b.category;amount=integer(b.face_cents,1,total,'转换额度');}
    const funded=cards.some(c=>c.lottery_funded);if(kind==='merge'&&funded)this.lottery.record(spaceId,amount-total,'merge',cards.map(c=>c.id).join(','));
    const design=CATEGORIES.find(c=>c.id===category),template=TEMPLATES.filter(t=>t.category===category&&t.face_cents<=amount).at(-1);
    const title=typeof b.title==='string'&&b.title.trim()?string(b.title,'卡片名称',50):(template?.title||`${design.name}心愿卡`);
    const available=cards.map(c=>c.available).sort().at(-1),base={id:first.prize_id,description:`${design.name} · 凭购买或充值记录，在额度内申请报销。`,emoji:template?.emoji||design.emoji,tone:design.tone,category,tier:template?.tier||'合成心愿',face_cents:amount,wait_days:0,title,lottery_funded:funded?1:0};
    const card=this.writeCard(user,base,kind,{manager_id:first.manager_id,available,space_id:spaceId});const outputs=[card];
    if(amount<total)outputs.push(this.writeCard(user,{...first,id:first.prize_id,title:'余下的小云朵',face_cents:total-amount},'convert-change',{manager_id:first.manager_id,available,space_id:spaceId}));
    for(const out of outputs){out.merge_roots=JSON.stringify([...new Set(roots)]);this.run('UPDATE cards SET merge_roots=? WHERE id=?',out.merge_roots,out.id);}
    for(const c of cards)this.run('UPDATE cards SET status=? WHERE id=?',kind==='merge'?'merged':'converted',c.id);
    const mid=id();this.run('INSERT INTO card_moves(id,user_id,kind,inputs,outputs,face_cents,created,space_id) VALUES(?,?,?,?,?,?,?,?)',mid,user.id,kind,JSON.stringify(cards.map(c=>c.id)),JSON.stringify(outputs.map(c=>c.id)),total,now(),spaceId);return {ok:true,card,outputs,move:{input_cents:total,output_cents:outputs.reduce((sum,c)=>sum+c.face_cents,0),bonus_cents:kind==='merge'?amount-total:0}};
  }
  renameRoom(user,body){
    const spaceId=this.ownSpace(user,body),room=this.get('SELECT * FROM spaces WHERE id=?',spaceId);
    requireThat(room.giver_id||room.family_id,'改名卡用在和伙伴一起的小屋里哦');
    const card=this.get('SELECT * FROM cards WHERE id=? AND user_id=? AND space_id=?',body.card_id,user.id,spaceId);
    requireThat(card,'这张卡不在你当前的小屋里',404);requireThat(card.effect==='room_rename','这张卡不是小屋改名卡');
    requireThat(card.status==='ready','这张改名卡已经用过啦',409);requireThat(Date.parse(card.available)<=Date.now(),'还没到这张卡的使用日期');
    requireThat(this.balance(spaceId)>=0,'先补足学习币待补余额，再挂新招牌吧');
    const name=string(body.name,'小屋新名字',24);requireThat(!/[\u0000-\u001f\u007f]/.test(body.name),'名字里不能放换行或控制字符哦');
    const oldName=room.family_id?this.get('SELECT name FROM families WHERE id=?',room.family_id).name:room.room_name;
    requireThat(body.expected_name===oldName,'伙伴刚换了新招牌，请刷新后再看看',409);requireThat(name!==oldName,'已经是这个名字啦，不用再花一张卡');
    if(room.family_id)this.run('UPDATE families SET name=? WHERE id=?',name,room.family_id);
    else this.run('UPDATE spaces SET room_name=? WHERE id=?',name,spaceId);
    this.run("UPDATE cards SET status='used',fulfilled=?,delivery_note=? WHERE id=?",now(),'小屋改名为「'+name+'」',card.id);
    return {ok:true,oldName,name,card_id:card.id};
  }
  redeem(user,body){
    const spaceId=this.ownSpace(user,body,{closed:true});
    const c=this.get('SELECT * FROM cards WHERE id=? AND user_id=? AND space_id=?',body.card_id,user.id,spaceId);requireThat(c,'奖品卡不存在',404);requireThat(!c.effect,'这是一张功能卡，请在卡包里直接使用');requireThat(c.status==='ready','奖品卡已申请、已消耗或已发放',409);requireThat(Date.parse(c.available)<=Date.now(),'还没有到这张卡的领取日期');requireThat(this.balance(spaceId)>=0,'请先补足撤销任务产生的待补余额');
    const note=c.face_cents?string(body.receipt_note,'购买或充值记录说明',1000):String(body.receipt_note||'').slice(0,1000),claim=c.face_cents?integer(body.claim_cents,1,c.face_cents,'报销金额'):0;
    if(body.receipt){const r=body.receipt;requireThat(['image/png','image/jpeg','image/webp'].includes(r.mime)&&typeof r.data==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(r.data)&&r.data.length<=4_194_304,'凭证支持 3 MB 以内的 PNG、JPG、WebP 图片');const bytes=Buffer.from(r.data,'base64');requireThat(bytes.length>12&&bytes.length<=3*1024*1024,'凭证大小无效');const valid=r.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):r.mime==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';requireThat(valid,'凭证内容与图片格式不符');this.run('INSERT OR REPLACE INTO receipts VALUES(?,?,?,?)',c.id,r.mime,bytes,now());}
    this.run("UPDATE cards SET status='requested',requested=?,receipt_note=?,claim_cents=?,redemption_version=redemption_version+1 WHERE id=?",now(),note,claim,c.id);return this.share(user,{card_id:c.id,space_id:spaceId});
  }
  share(user,b){const spaceId=this.ownSpace(user,b,{closed:true});const c=this.get('SELECT id,status FROM cards WHERE id=? AND user_id=? AND space_id=?',b.card_id,user.id,spaceId);requireThat(c?.status==='requested','先申请报销，再生成核销链接',409);const token=randomBytes(32).toString('hex'),expires=Date.now()+14*86400_000;this.run('INSERT INTO redemption_links VALUES(?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,created=excluded.created',c.id,hash(token),expires,now());return {ok:true,token,expires};}
  shareCard(user,token){requireThat(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'核销链接无效',404);const r=this.get('SELECT * FROM redemption_links WHERE token_hash=?',hash(token));requireThat(r&&r.expires>Date.now(),'核销链接已过期或已被替换，请让持卡人重新生成',404);const c=this.get('SELECT c.*,u.name,EXISTS(SELECT 1 FROM receipts WHERE card_id=c.id) AS has_receipt FROM cards c JOIN users u ON u.id=c.user_id WHERE c.id=?',r.card_id);requireThat(c&&this.canFulfill(user,c),'只有这张卡对应的发奖人可以查看和核销',403);return {ok:true,card:c};}
  receipt(user,cardId){const c=this.get('SELECT user_id,manager_id,space_id FROM cards WHERE id=?',cardId);requireThat(c&&(c.user_id===user.id||this.canFulfill(user,c)),'凭证不存在',404);const r=this.get('SELECT mime,data FROM receipts WHERE card_id=?',cardId);requireThat(r,'凭证不存在',404);return r;}
  canFulfill(user,c){const r=this.get('SELECT family_id FROM spaces WHERE id=?',c.space_id);return this.canManage(user,c.space_id,{closed:true})&&(!!r?.family_id||c.manager_id===user.id);}
  fulfill(user,body){const c=this.get('SELECT * FROM cards WHERE id=?',body.card_id);requireThat(c,'奖品卡不存在',404);this.admin(user,c.space_id,{closed:true});requireThat(this.canFulfill(user,c),'只有发卡或已承接的发奖人可以核销',403);if(body.token)requireThat(this.shareCard(user,body.token).card.id===c.id,'核销链接不匹配',403);requireThat(c.status==='requested','请先由持卡人申请兑奖，或此卡已经核销',409);requireThat(body.expectedVersion===c.redemption_version,'报销申请已变化，请重新打开并核对凭证后确认',409);requireThat(this.balance(c.space_id)>=0,'持卡人还有待补余额，请补足后发放');const paid=c.face_cents?integer(body.paid_cents,1,c.claim_cents,'实际报销金额'):0;this.run("UPDATE cards SET status='fulfilled',fulfilled=?,delivery_note=?,paid_cents=?,fulfilled_by=? WHERE id=?",now(),string(body.note,'发放说明',200),paid,user.id,c.id);return {ok:true};}
  cancelRedemption(user,b){const spaceId=this.ownSpace(user,b,{closed:true});const c=this.get('SELECT * FROM cards WHERE id=? AND user_id=? AND space_id=?',b.card_id,user.id,spaceId);requireThat(c?.status==='requested','只能撤回尚未核销的申请',409);this.run("UPDATE cards SET status='ready',requested=NULL,receipt_note='',claim_cents=0 WHERE id=?",c.id);this.run('DELETE FROM redemption_links WHERE card_id=?',c.id);this.run('DELETE FROM receipts WHERE card_id=?',c.id);return {ok:true};}
  savePrize(user,body){
    const spaceId=this.admin(user,body.space_id),title=string(body.title,'奖品名称',50),description=string(body.description,'奖品说明',300),emoji=string(body.emoji,'图标',12),tone=['peach','mint','lilac','yellow','sky','rainbow'].includes(body.tone)?body.tone:'mint';
    const category=body.category||'custom';requireThat(CATEGORIES.some(c=>c.id===category),'奖品品类无效');const face=integer(body.face_cents||0,category==='custom'?0:1,1_000_000,'人民币额度（分）'),tier=string(body.tier||'小小心愿','卡片等级',24);
    const pid=body.id||id(),current=body.id?this.get('SELECT * FROM prizes WHERE id=? AND room_id=? AND removed=0',pid,spaceId):null;if(body.id){requireThat(current,'奖品不存在',404);if(body.expectedStock!==undefined)requireThat(body.expectedStock===current.stock,'编辑期间库存已变化，请关闭弹窗并刷新后重新编辑',409);}
    const channel=current?.channel||body.channel||'shop';requireThat(['shop','lottery'].includes(channel),'奖励清单无效');
    const effect=body.effect??current?.effect??'';requireThat(['','room_rename','day_theme','extra_draw','shop_drop',...PET_EFFECTS].includes(effect),'卡片用途无效');requireThat(!effect||(category==='custom'&&face===0),'功能卡不含报销额度，请选择特别约定并填 0 元');requireThat(channel==='lottery'||!['extra_draw','shop_drop','pet_companion'].includes(effect),'续杯、偷偷卡和小伙伴仅在抽奖中提供');
    requireThat(channel!=='lottery'||face>0||effect,'抽奖奖励需填写报销额度，或选择一种功能卡');
    const rate=this.settings(spaceId).rates[category]||DEFAULT_RATES[category],cost=body.use_rate&&!effect?Math.ceil(face*rate/100):integer(body.cost,1,1_000_000,'售价');integer(cost,1,1_000_000,'售价');
    this.run('INSERT INTO prizes(id,title,description,emoji,tone,cost,stock,weight,wait_days,active,space_id,category,face_cents,tier,room_id,effect,channel) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,emoji=excluded.emoji,tone=excluded.tone,cost=excluded.cost,stock=excluded.stock,weight=excluded.weight,wait_days=excluded.wait_days,active=excluded.active,category=excluded.category,face_cents=excluded.face_cents,tier=excluded.tier,effect=excluded.effect',pid,title,description,emoji,tone,cost*COIN,integer(body.stock,0,10000,'库存'),channel==='shop'?0:this.settings(spaceId).fixedOdds?(current?.active&&body.active?current.weight:0):integer(body.weight??5,0,10000,'抽奖权重'),integer(body.wait_days,0,365,'延迟天数'),body.active?1:0,this.get('SELECT learner_id FROM spaces WHERE id=?',spaceId).learner_id,category,face,tier,spaceId,effect,channel);return {ok:true,id:pid};
  }
  addTemplates(user,b){
    const spaceId=this.admin(user,b.space_id);requireThat(Array.isArray(b.templates)&&b.templates.length>0&&b.templates.length<=TEMPLATES.length+PET_TEMPLATES.length,'请选择心愿模板');
    const selected=[...new Set(b.templates)].map(tid=>{const t=[...TEMPLATES,...PET_TEMPLATES].find(t=>t.template_id===tid);requireThat(t,'模板不存在');return t;});let added=0,restored=0;
    for(const t of selected){
      const existing=this.get("SELECT * FROM prizes WHERE room_id=? AND channel='shop' AND template_id=? ORDER BY removed,id LIMIT 1",spaceId,t.template_id);
      if(existing){if(existing.removed){this.restorePrizes(user,{space_id:spaceId,ids:[existing.id]});restored++;}continue;}
      const result=this.savePrize(user,{...t,space_id:spaceId,use_rate:!t.effect});this.run('UPDATE prizes SET template_id=? WHERE id=?',t.template_id,result.id);added++;
    }return {ok:true,added,restored};
  }
  removePrizes(user,b){
    const spaceId=this.admin(user,b.space_id);requireThat(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.length<=200&&new Set(b.ids).size===b.ids.length,'选一下要移除的心愿卡');
    const rows=b.ids.map(id=>this.get('SELECT * FROM prizes WHERE id=? AND room_id=?',id,spaceId));requireThat(rows.every(Boolean),'心愿卡不在这间小屋',404);
    for(const p of rows)this.run('UPDATE prizes SET removed=1 WHERE id=?',p.id);return {ok:true,count:rows.length};
  }
  restorePrizes(user,b){
    const spaceId=this.admin(user,b.space_id);requireThat(Array.isArray(b.ids)&&b.ids.length>0&&b.ids.length<=200&&new Set(b.ids).size===b.ids.length,'选一下要恢复的心愿卡');
    const rows=b.ids.map(id=>this.get('SELECT * FROM prizes WHERE id=? AND room_id=?',id,spaceId));requireThat(rows.every(Boolean),'心愿卡不在这间小屋',404);
    for(const p of rows)if(p.removed)this.run('UPDATE prizes SET removed=0,weight=? WHERE id=?',this.settings(spaceId).fixedOdds?0:p.weight,p.id);return {ok:true,count:rows.length};
  }
  oddsConfig(spaceId){
    spaceId=this.rewardSpaceId(spaceId);const s=this.settings(spaceId),prizes=this.all("SELECT * FROM prizes WHERE room_id=? AND channel='lottery' AND removed=0 AND active=1 ORDER BY id",spaceId);
    const version=hash(JSON.stringify({prizes,s:[s.fixedOdds||false,s.blankWeight]}));
    if(s.fixedOdds)return {version,fixed:true,entries:prizes.map(p=>({id:p.id,bps:p.weight})),blankBps:10000-prizes.reduce((sum,p)=>sum+p.weight,0)};
    const pool=this.pool(spaceId),rounded=pool.map(p=>({id:p.id,bps:Math.floor(p.probability*10000),remainder:p.probability*10000%1}));
    let left=10000-rounded.reduce((sum,p)=>sum+p.bps,0);for(const p of [...rounded].sort((a,b)=>b.remainder-a.remainder))if(left-->0)p.bps++;
    return {version,fixed:false,entries:prizes.map(p=>({id:p.id,bps:rounded.find(x=>x.id===p.id)?.bps||0})),blankBps:rounded[0].bps};
  }
  saveOdds(user,b){
    const spaceId=this.admin(user,b.space_id),config=this.oddsConfig(spaceId);requireThat(b.version===config.version,'奖池或库存刚刚有变化，请刷新后再保存',409);
    requireThat(Array.isArray(b.entries)&&b.entries.length===config.entries.length&&new Set(b.entries.map(e=>e.id)).size===b.entries.length,'请为每张上架卡填写概率');
    const ids=new Set(config.entries.map(e=>e.id));let total=0;for(const e of b.entries){requireThat(ids.has(e.id),'这张卡不在当前奖池',409);total+=integer(e.bps,0,10000,'中奖率（万分比）');}requireThat(total<=10000,'卡片中奖率加起来不能超过 100%，余下的是下次好运');
    const repeat=b.entries.filter(e=>this.get('SELECT effect FROM prizes WHERE id=?',e.id).effect==='extra_draw').reduce((n,e)=>n+e.bps,0);requireThat(repeat<=2500,'好运续杯合计概率最多 25%，留一点期待也控制机会数量');
    for(const e of b.entries)this.run('UPDATE prizes SET weight=? WHERE id=? AND room_id=?',e.bps,e.id,spaceId);
    const s={...this.settings(spaceId),blankWeight:10000-total,fixedOdds:true};this.run('INSERT INTO room_settings VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value',spaceId,JSON.stringify(s));return {ok:true};
  }
  saveSettings(user,b){const spaceId=this.admin(user,b.space_id),current=this.settings(spaceId),rates={};const dailyBonusKind=b.dailyBonusKind??current.dailyBonusKind;requireThat(['none','coins','ticket'].includes(dailyBonusKind),'选择一种全勤奖励吧');const dailyBonusAmount=integer(b.dailyBonusAmount??current.dailyBonusAmount,1,dailyBonusKind==='ticket'?10:1000,'全勤奖励数量');for(const c of CATEGORIES)rates[c.id]=integer(b.rates?.[c.id]??this.settings(spaceId).rates[c.id],1,1000,`${c.name}每元学习币`);const priority=['study','sport','healthy','essentials','beauty','food'];requireThat(priority.every((k,i)=>!i||rates[priority[i-1]]<=rates[k]),'同额优先级应为学习、运动、健康饮食、衣鞋包、首饰香水、零食饮料');const taskScoreMode=b.taskScoreMode??current.taskScoreMode;requireThat(['manual','difficulty'].includes(taskScoreMode),'请选择一种计分方式');const defaultDifficulty=b.defaultDifficulty??current.defaultDifficulty;requireThat(DIFFICULTIES.some(d=>d.id===defaultDifficulty),'默认投入等级无效');const defaultPoints=integer(b.defaultPoints??current.defaultPoints,1,100,'默认分数'),difficultyPoints={};for(const d of DIFFICULTIES)difficultyPoints[d.id]=integer(b.difficultyPoints?.[d.id]??current.difficultyPoints[d.id],1,100,d.name+'分数');requireThat(DIFFICULTIES.every((d,i)=>!i||difficultyPoints[DIFFICULTIES[i-1].id]<=difficultyPoints[d.id]),'投入等级越高，分数不能更低');const s={taskScoreMode,defaultDifficulty,defaultPoints,difficultyPoints,spaceName:string(b.spaceName,'空间名',24),coinName:string(b.coinName,'学习币名称',12),dailyCap:integer(b.dailyCap,1,1000,'每日上限'),drawCost:integer(b.drawCost,1,10000,'抽奖花费'),drawLimit:integer(b.drawLimit,1,50,'每日抽奖次数'),blankWeight:current.fixedOdds?current.blankWeight:integer(b.blankWeight??current.blankWeight,1,10000,'未中奖权重'),fixedOdds:!!current.fixedOdds,marketThreshold:integer(b.marketThreshold,1,100000,'市场解锁门槛'),rates,dailyBonusKind,dailyBonusAmount};this.run('INSERT INTO room_settings VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value',spaceId,JSON.stringify(s));return {ok:true};}
  invite(user,b,generateCode=()=>randomBytes(12).toString('hex')){const direction=b.direction||'learner';requireThat(['manager','learner'].includes(direction),'邀请类型无效');const label=string(b.label||'一起成长','邀请备注',40);for(let attempt=0;attempt<5;attempt++){const code=generateCode();const result=this.run('INSERT OR IGNORE INTO invites(hash,label,remaining,expires,created,creator_id,direction) VALUES(?,?,?,?,?,?,?)',hash(code),label,1,Date.now()+7*86400_000,now(),user.id,direction);if(result.changes)return {ok:true,code,direction};}throw new Fault('暂时无法生成新的邀请码，请稍后重试',503);}
  lesson(user,b){requireThat(['money','ledger','risk','blockchain'].includes(b.lesson),'课程不存在');this.run('INSERT OR IGNORE INTO room_lessons VALUES(?,?,?)',this.ownSpace(user,b),b.lesson,now());return {ok:true};}
  state(user,spaceId){
    spaceId=this.viewSpace(user,spaceId);this.plans.settle(spaceId);const room=this.get('SELECT * FROM spaces WHERE id=?',spaceId),day=dayAt(),s=this.settings(spaceId),owner=this.get('SELECT id,name,username FROM users WHERE id=?',room.learner_id),manager=room.giver_id?this.get('SELECT id,name,username FROM users WHERE id=?',room.giver_id):null;
    const rooms=this.all('SELECT s.id,s.room_name,s.learner_id,s.giver_id,s.status,s.family_id,s.created_by,f.name AS family_name,u.name AS learner_name,u.username AS learner_username,g.name AS giver_name,g.username AS giver_username FROM spaces s JOIN users u ON u.id=s.learner_id LEFT JOIN users g ON g.id=s.giver_id LEFT JOIN families f ON f.id=s.family_id WHERE s.learner_id=? OR s.giver_id=? ORDER BY s.created,s.id',user.id,user.id),rewardSpace=this.rewardSpaceId(spaceId),family=this.community.family(user,spaceId),canFulfill=this.canManage(user,spaceId,{closed:true});
    const timings=this.progress.times(spaceId,day),tasks=this.todayTasks(spaceId,day).map(t=>({...t,points:this.taskScore(spaceId,{},t).points,timing:timings[t.id]||{elapsed_ms:0,running_since:null}}));
    const cards=!family||owner.id===user.id||canFulfill?this.all('SELECT c.*,EXISTS(SELECT 1 FROM receipts WHERE card_id=c.id) AS has_receipt FROM cards c WHERE space_id=? ORDER BY created DESC',spaceId):[],pool=this.pool(spaceId);
    const result={user:{id:user.id,name:user.name,username:user.username,role:user.role,email:user.email||null,email_verified:!!user.email_verified,github_login:user.github_login||null},csrf:user.csrf,day,settings:s,scoreVersion:this.scoreVersion(spaceId),difficulties:DIFFICULTIES,
      space:{id:spaceId,roomName:family?.name||room.room_name,learner_id:owner.id,name:owner.name,isSelf:owner.id===user.id,personal:!manager&&!family,manager:family?{name:family.members.filter(m=>m.is_admin).map(m=>m.name).join('、')}:manager,canManage:this.canManage(user,spaceId),canFulfill,status:room.status,family_id:room.family_id,created_by:room.created_by},rooms:rooms.filter(r=>r.status==='active'),archivedRooms:rooms.filter(r=>r.status!=='active'),family,community:this.community.overview(user),closure:this.community.closureInfo(user,spaceId),
      rewardRooms:rooms.filter(r=>r.status==='active'&&r.learner_id===user.id&&(r.giver_id||r.family_id)).map(r=>({...r,prizeCount:this.get('SELECT COUNT(*) n FROM prizes WHERE room_id=? AND removed=0 AND active=1',this.rewardSpaceId(r.id)).n})),
      balance:this.balance(spaceId),tasks,dailyBonus:this.dailyBonus(spaceId,day,tasks),ticketBalance:this.ticketBalance(spaceId),ticketLedger:this.all('SELECT * FROM ticket_ledger WHERE space_id=? ORDER BY seq DESC LIMIT 100',spaceId),futureTasks:this.plans.future(spaceId,day),taskSettlement:this.plans.status(spaceId,day),dailyTaskEarned:this.plans.dailyEarned(spaceId,day),
      earnedToday:this.get('SELECT COALESCE(SUM(points),0) n FROM completions WHERE space_id=? AND day=? AND done=1',spaceId,day).n,
      earnedTotal:this.get('SELECT COALESCE(SUM(points),0) n FROM completions WHERE space_id=? AND done=1',spaceId).n,
      history:this.all('SELECT day,COUNT(*) count,SUM(points) points FROM completions WHERE space_id=? AND done=1 GROUP BY day ORDER BY day DESC LIMIT 90',spaceId),
      ledger:this.all('SELECT * FROM ledger WHERE space_id=? ORDER BY seq DESC LIMIT 100',spaceId),prizes:this.all("SELECT * FROM prizes WHERE room_id=? AND channel='shop' AND removed=0 AND active=1 ORDER BY cost",rewardSpace),lottery:this.lottery.report(spaceId,pool),theme:this.lottery.theme(spaceId),cards,pool,poolVersion:hash(JSON.stringify(pool)),categories:CATEGORIES,templates:[...TEMPLATES,...PET_TEMPLATES],pet:this.pets.state(spaceId),travel:(()=>{const travel=this.travel.state(spaceId);if(family&&owner.id!==user.id&&!canFulfill)travel.supplies=[];return travel;})(),growthRules:this.progress.rules(spaceId),serverNow:Date.now(),
      cardMoves:this.all('SELECT m.*,(SELECT SUM(face_cents) FROM cards WHERE id IN (SELECT value FROM json_each(m.outputs))) AS output_cents FROM card_moves m WHERE space_id=? ORDER BY created DESC LIMIT 100',spaceId),drawCount:this.get('SELECT COUNT(*) n FROM draws WHERE space_id=? AND day=? AND cost>0',spaceId,day).n,
      draws:this.all('SELECT d.id,d.created,d.cost,p.title FROM draws d LEFT JOIN prizes p ON p.id=d.prize_id WHERE d.space_id=? ORDER BY d.created DESC LIMIT 20',spaceId),lessons:this.all('SELECT lesson FROM room_lessons WHERE space_id=?',spaceId).map(r=>r.lesson)};
    if(canFulfill){const redemptions=family?this.all("SELECT c.*,u.name,EXISTS(SELECT 1 FROM receipts WHERE card_id=c.id) AS has_receipt FROM cards c JOIN spaces sp ON sp.id=c.space_id JOIN users u ON u.id=c.user_id WHERE sp.family_id=? AND c.status IN ('requested','fulfilled') ORDER BY c.requested DESC",family.id):cards.filter(c=>c.manager_id===user.id&&['requested','fulfilled'].includes(c.status)).map(c=>({...c,name:owner.name}));result.admin={prizes:this.all('SELECT * FROM prizes WHERE room_id=? AND removed=0 ORDER BY cost',rewardSpace),removedPrizes:this.all('SELECT * FROM prizes WHERE room_id=? AND removed=1 ORDER BY cost',rewardSpace),odds:this.oddsConfig(rewardSpace),redemptions};}return result;
  }
  async seedDemo(){if(this.get('SELECT id FROM users LIMIT 1'))return;const password=await passwordHash(randomBytes(24).toString('hex'));this.tx(()=>{
    const u=this.newUser({username:'demo',name:'小凡',password,role:'admin'}),a=this.newUser({username:'seedling',name:'小芽',password}),c=this.newUser({username:'sunshine',name:'晴天',password});a.space_id=this.pair(a.id,u.id).space_id;u.space_id=this.pair(u.id,c.id).space_id;this.post(u.space_id,2580*COIN,'demo','示例初始学习币','demo');this.post(a.space_id,600*COIN,'demo','示例学习币','demo');
    this.createTasks(u,{tasks:[{title:'C 语言第二次作业',points:25,category:'学习',recurrence:'once',quadrant:'urgent-important'},{title:'背 20 个四级单词',points:20,category:'学习',recurrence:'daily',quadrant:'not-urgent-important'},{title:'运动 30 分钟，让身体充充电',points:25,category:'运动',recurrence:'daily',quadrant:'not-urgent-important'},{title:'整理今天的待办消息',points:10,category:'生活',recurrence:'once',quadrant:'urgent-not-important'},{title:'看一期喜欢的视频',points:10,category:'生活',recurrence:'once',quadrant:'not-urgent-not-important'}]});this.createTasks(a,{tasks:[{title:'小芽的阅读计划',points:20,category:'学习',recurrence:'daily'}]});
    const tid=this.get('SELECT id FROM tasks WHERE user_id=? LIMIT 1',u.id).id;this.complete(u,{task_id:tid,done:true});
    this.addTemplates(c,{space_id:u.space_id,templates:[...TEMPLATES,...PET_TEMPLATES].map(t=>t.template_id)});this.addTemplates(u,{space_id:a.space_id,templates:TEMPLATES.filter(t=>t.category==='study'||t.category==='food').map(t=>t.template_id)});
    for(const [manager,room] of [[c,u.space_id],[u,a.space_id]])this.lottery.defaults(manager,{space_id:room,version:this.oddsConfig(room).version});
    for(const category of ['food','food','food','universal']){const p=this.get('SELECT * FROM prizes WHERE room_id=? AND category=? ORDER BY face_cents LIMIT 1',u.space_id,category);this.issue(u,p,'demo');}
  });}
}
