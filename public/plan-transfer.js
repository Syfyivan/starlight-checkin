import {QUADRANTS} from './plans.js';
import {taskKind} from './task-types.js';

export const PLAN_FORMAT='starlight-plans';
const DAY=86400000;
const fail=message=>{throw new Error(message);};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const add=(value,days)=>new Date(Date.parse(value)+days*DAY).toISOString().slice(0,10);
const distance=(a,b)=>Math.round((Date.parse(a)-Date.parse(b))/DAY);

// A portable definition contains no account IDs, receipts, completion records or balances.
export function taskDefinition(t){
  return {title:t.title,task_kind:taskKind(t),repeat_days:t.repeat_days||1,category:t.category||'学习',quadrant:t.quadrant||'none',points:t.points,difficulty:t.difficulty||'',estimated_minutes:t.estimated_minutes||0,start_date:t.start_date,deadline:t.deadline||'',...(t.mode?{mode:t.mode}:{})};
}
export function planDocument(tasks,scope,day){return {format:PLAN_FORMAT,version:1,scope,exported_on:day,tasks:tasks.map(taskDefinition)};}
export function plansMarkdown(doc){
  return '# 小小成就 · '+(doc.scope==='shared'?'共同计划':'个人计划')+'\n\n'+QUADRANTS.map(([id,label])=>{
    const tasks=doc.tasks.filter(t=>t.quadrant===id);return tasks.length?'### '+label+'\n\n'+tasks.map(t=>'- [ ] '+t.title.replace(/[\r\n]+/g,' ')+(t.estimated_minutes?'（预估 '+t.estimated_minutes+' 分钟）':'')).join('\n')+'\n':'';
  }).filter(Boolean).join('\n');
}
export function readPlanJSON(text,{scope='personal',start_date,defaults={},settings}={}){
  if(new TextEncoder().encode(text).length>256*1024)fail('文件不能超过 256 KB');
  let doc;try{doc=JSON.parse(text.replace(/^\uFEFF/,''));}catch{fail('JSON 没有读懂，请检查格式，或直接上传导出的备份文件');}
  const portable=doc?.format!==undefined;
  if(portable&&(doc.format!==PLAN_FORMAT||doc.version!==1))fail('这份备份的格式或版本暂不支持');
  if(portable&&doc.scope!==scope)fail('这是'+(doc.scope==='shared'?'共同':'个人')+'计划，请切换到对应的计划页导入');
  const tasks=Array.isArray(doc)?doc:doc?.tasks;
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>150)fail('JSON 一次可导入 1–150 个计划');
  if(!date(start_date))fail('请选择有效的开始日期');
  const anchor=portable?doc.exported_on:start_date;
  if(!date(anchor))fail('备份中的导出日期无效');
  return tasks.map((raw,index)=>{
    const error=message=>fail('第 '+(index+1)+' 项：'+message);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))error('计划格式不正确');
    const t=taskDefinition({...defaults,...raw,task_kind:raw.task_kind||(raw.recurrence==='daily'?'repeat':defaults.task_kind)});
    if(typeof t.title!=='string'||!t.title.trim()||t.title.trim().length>100)error('计划名称需要 1–100 字');
    t.title=t.title.trim();
    if(!['normal','repeat','long'].includes(t.task_kind))error('任务类型无效');
    t.repeat_days=Number(t.repeat_days);
    if(![1,2,7].includes(t.repeat_days))error('重复周期请选择 1、2 或 7 天');
    if(!['学习','运动','生活','工作'].includes(t.category))error('分类请用学习、运动、生活或工作');
    if(!QUADRANTS.some(([id])=>id===t.quadrant))error('四象限分类无效');
    t.estimated_minutes=Number(t.estimated_minutes);
    if(!Number.isInteger(t.estimated_minutes)||t.estimated_minutes<0||t.estimated_minutes>1440)error('预估时间需要 0–1440 分钟');
    if(t.difficulty&&!['easy','standard','hard','challenge'].includes(t.difficulty))error('任务等级无效');
    if(t.task_kind!=='long'&&settings.taskScoreMode==='difficulty'){
      t.difficulty=t.difficulty||settings.defaultDifficulty;t.points=settings.difficultyPoints[t.difficulty];
    }else {t.points=Number(t.points);t.difficulty='';}
    if(!Number.isInteger(t.points)||t.points<1||t.points>(t.task_kind==='long'?1000000:100))error('分数超出本屋允许的范围');
    const original=t.start_date||anchor;if(!date(original))error('开始日期无效');
    let offset=Math.max(0,distance(original,anchor));
    if(t.task_kind==='repeat'&&original<anchor)offset=(t.repeat_days-distance(anchor,original)%t.repeat_days)%t.repeat_days;
    t.start_date=add(start_date,offset);
    if(t.deadline){if(!date(t.deadline)||t.deadline<original)error('截止日期无效');t.deadline=add(start_date,Math.max(offset,distance(t.deadline,anchor)));}
    if(t.task_kind!=='long')t.deadline='';
    t.recurrence=t.task_kind==='repeat'?'daily':'once';
    if(scope==='shared'){t.mode=raw.mode||defaults.mode||'each';if(!['each','together'].includes(t.mode))error('共同完成方式无效');}else delete t.mode;
    return t;
  });
}
