export const QUADRANTS=[['none','普通计划'],['urgent-important','紧急 & 重要'],['urgent-not-important','紧急 & 不重要'],['not-urgent-important','不紧急 & 重要'],['not-urgent-not-important','不紧急 & 不重要']];
export function headingQuadrant(text){
  const s=text.replace(/[\\#*_`>\s：:（()）\d.、-]/g,'');
  if(!s.includes('紧急')||!s.includes('重要'))return null;
  if(s.replace(/第?[一二三四1234]?象限/g,'').replace(/不紧急|非紧急|紧急|不重要|非重要|重要|且|和|与|[&＆/|]/g,''))return null;
  const urgent=!/(不紧急|非紧急)/.test(s),important=!/(不重要|非重要)/.test(s);
  return `${urgent?'urgent':'not-urgent'}-${important?'important':'not-important'}`;
}
export function durationLabel(minutes){if(!minutes)return '';const h=Math.floor(minutes/60),m=minutes%60;return (h?h+' 小时':'')+(h&&m?' ':'')+(m?m+' 分钟':'');}
export function extractEstimate(title){
  const match=title.match(/\s*[（(\[]\s*(?:预估|预计|耗时|用时)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(分钟|分|min|m|小时|时|h)\s*[）)\]]\s*$/i);
  if(!match)return {title,estimated_minutes:0};
  const minutes=Number(match[1])*(/小时|时|h/i.test(match[2])?60:1);
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('预估时间请填 1–1440 分钟');
  return {title:title.slice(0,match.index).trim(),estimated_minutes:minutes};
}
export function parseMarkdown(text,{points=20,recurrence='once',category='学习',start_date=''}={}){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>256*1024)throw new Error('文字不能超过 256 KB');
  let quadrant='none',checked=0;const tasks=[],ignored=[];
  for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    let line=raw.trim();if(!line||/^```/.test(line)||/^(?:---+|\*\*\*+)$/.test(line))continue;
    line=line.replace(/^\\+(?=[#\[\-*])/,'').replace(/^>\s*/, '').replace(/\\([#\[\]])/g,'$1');
    const q=headingQuadrant(line);
    if(q&&(!/\[[ xX✓✔]\]/.test(line))){quadrant=q;continue;}
    if(/^#{1,6}\s*/.test(line)){quadrant='none';continue;}
    const checkbox=line.match(/^(?:(?:[-*+•]|\d+[.)、])\s*)?\[([ xX✓✔])\]\s*(.+)$/);
    const bullet=line.match(/^(?:[-*+•]|\d+[.)、])\s+(.+)$/);
    let title=checkbox?checkbox[2]:bullet?bullet[1]:line;
    if(checkbox&&checkbox[1].trim())checked++;
    title=title.replace(/^\*\*(.*?)\*\*$/,'$1').trim();
    const estimate=extractEstimate(title);title=estimate.title;
    if(!title){ignored.push(raw);continue;}
    if(title.length>100)throw new Error(`“${title.slice(0,18)}…”超过 100 字，请拆成小计划`);
    tasks.push({estimated_minutes:estimate.estimated_minutes,title,points:Number(points),recurrence,category,start_date,quadrant});
  }
  if(!tasks.length||tasks.length>50)throw new Error('一次可导入 1–50 个计划');
  return {tasks,checked,ignored:ignored.length};
}
