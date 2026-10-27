export const TASK_TYPES=[['normal','普通任务'],['repeat','重复任务'],['long','长期任务']];
export const REPEAT_OPTIONS=[[1,'每天'],[2,'每两天'],[7,'每周']];
export const LONG_POINTS_MAX=10000;
export function taskKind(task){return task.task_kind||(task.recurrence==='daily'?'repeat':'normal');}
export function scheduledOn(task,day){
  if(task.start_date>day)return false;
  if(taskKind(task)!=='repeat')return true;
  const days=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(task.start_date+'T00:00:00Z'))/86400000);
  return days%(task.repeat_days||1)===0;
}
export function dueOn(task,day){return taskKind(task)==='long'?task.deadline===day:scheduledOn(task,day);}
export function taskTypeLabel(task){return taskKind(task)==='long'?'长期任务'+(task.deadline?' · '+task.deadline+' 截止':''):taskKind(task)==='repeat'?(REPEAT_OPTIONS.find(r=>r[0]===(task.repeat_days||1))?.[1]||'重复'):'普通任务';}
export function nextTaskDay(task,day){
  if(task.start_date>day)return task.start_date;
  if(taskKind(task)!=='repeat')return null;
  const interval=task.repeat_days||1,days=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(task.start_date+'T00:00:00Z'))/86400000);
  return new Date(Date.parse(day+'T00:00:00Z')+(interval-days%interval)*86400000).toISOString().slice(0,10);
}
