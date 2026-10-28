import {requireThat} from './store.mjs';
import {COIN,dayAt} from './common.mjs';
import {planDocument,taskDefinition} from '../public/plan-transfer.js';

export function exportPlans(s,user,query={}){
  const space=s.viewSpace(user,query.space),scope=query.scope||'personal';
  requireThat(['personal','shared'].includes(scope),'请选择个人计划或共同计划');
  let tasks;
  if(scope==='shared'){
    const f=s.familyPlay.family(user,space,{active:false});
    tasks=s.all('SELECT p.* FROM family_plans p WHERE p.family_id=? AND p.archived=0 AND EXISTS(SELECT 1 FROM tasks t WHERE t.family_plan_id=p.id AND t.user_id=?) ORDER BY p.created,p.id',f.id,user.id).map(p=>({...s.get('SELECT * FROM tasks WHERE family_plan_id=? AND user_id=?',p.id,user.id),mode:p.mode}));
  }else tasks=s.all('SELECT * FROM tasks WHERE space_id=? AND archived=0 AND family_plan_id IS NULL ORDER BY created,id',space);
  return planDocument(tasks.map(t=>({...t,points:s.taskScore(t.space_id,{},t).points/COIN})),scope,dayAt());
}

export function importPlans(s,user,body){
  const scope=body.scope||'personal';requireThat(['personal','shared'].includes(scope),'请选择个人计划或共同计划');
  requireThat(Array.isArray(body.tasks)&&body.tasks.length>0&&body.tasks.length<=150,'一次可导入 1–150 个计划');
  const space=s.ownSpace(user,body),f=scope==='shared'?s.familyPlay.family(user,space):null;
  const fingerprint=(raw,sid=space)=>{
    const t=taskDefinition(raw),score=s.taskScore(sid,t,{task_kind:t.task_kind});
    t.title=t.title?.trim();
    if(t.task_kind!=='repeat')t.repeat_days=1;
    if(t.start_date<dayAt()){
      const gap=Math.round((Date.parse(dayAt())-Date.parse(t.start_date))/86400000),offset=t.task_kind==='repeat'?(t.repeat_days-gap%t.repeat_days)%t.repeat_days:0;
      t.start_date=new Date(Date.parse(dayAt())+offset*86400000).toISOString().slice(0,10);
    }
    if(t.deadline&&t.deadline<dayAt())t.deadline=dayAt();
    return JSON.stringify({...t,points:score.points,difficulty:score.difficulty});
  };
  const existing=new Set();
  if(f){
    requireThat(Array.isArray(body.user_ids)&&body.user_ids.length>=2&&new Set(body.user_ids).size===body.user_ids.length&&body.user_ids.includes(user.id)&&body.user_ids.every(uid=>f.members.some(m=>m.user_id===uid)),'请选择包括自己在内的 2–6 位参与者');
    for(const p of s.all('SELECT * FROM family_plans WHERE family_id=? AND archived=0',f.id)){
      const members=s.all('SELECT * FROM tasks WHERE family_plan_id=? ORDER BY user_id',p.id);
      if(JSON.stringify(members.map(t=>t.user_id).sort())===JSON.stringify([...body.user_ids].sort())){
        const t=members.find(t=>t.user_id===user.id);existing.add(fingerprint({...t,points:t.points/COIN,mode:p.mode}));
      }
    }
  }else for(const t of s.all('SELECT * FROM tasks WHERE space_id=? AND archived=0 AND family_plan_id IS NULL',space))existing.add(fingerprint({...t,points:t.points/COIN}));
  const ids=[];let skipped=0,bonus;
  for(const raw of body.tasks){
    requireThat(raw&&typeof raw==='object'&&!Array.isArray(raw),'计划格式不正确');
    const task=taskDefinition(raw);task.recurrence=task.task_kind==='repeat'?'daily':'once';
    if(!f)delete task.mode;else task.mode=task.mode||'each';
    const key=fingerprint(task);
    if(body.skip_duplicates!==false&&existing.has(key)){skipped++;continue;}
    if(f)ids.push(s.familyPlay.create(user,{space_id:space,user_ids:body.user_ids,mode:task.mode||'each',task}).id);
    else {const result=s.createTasks(user,{space_id:space,tasks:[task]});ids.push(...result.ids);if(result.bonus)bonus=result.bonus;}
    existing.add(key);
  }
  s.community.audit(user,space,'tasks.import',`导入 ${ids.length} 个${f?'共同':'个人'}计划 · 跳过 ${skipped} 个重复项`,{titles:body.tasks.map(t=>t.title),added:ids.length,skipped,bonus});
  s.progress.sync(space);
  return {ok:true,added:ids.length,skipped,ids,...(bonus?{bonus}:{})};
}
