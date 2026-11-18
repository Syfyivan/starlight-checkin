import {postcardScene} from './travel-art.js';
const el=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const catalog=await fetch('/api/review/atlas').then(r=>{if(!r.ok)throw Error('无法打开目录');return r.json();});
el('summary').textContent='共 '+catalog.length+' 个目的地。点开任意一站，可以检查明信片、知识问答、学习任务和资料来源。';
function render(){
 const q=el('search').value.trim(),theme=el('theme').value;
 const rows=catalog.filter(s=>(!theme||theme===s.theme)&&[s.place,s.stamp,s.fact,s.question,s.practice].join(' ').includes(q));
 el('count').textContent=rows.length+' 站';
 el('places').innerHTML=rows.map(s=>`<details><summary>${escape(s.place)} · ${escape(s.stamp)}</summary><article>${postcardScene(s.id)}<p>${escape(s.story)}</p><p><b>带回的小知识</b>　${escape(s.fact)}</p><details><summary>${escape(s.question)}</summary><p>${s.choices.map(escape).join(' / ')}</p><p>答案　${escape(s.choices[s.answer])}</p></details><p><b>回家试一试</b>　${escape(s.practice)}</p><p><b>纪念物</b>　${escape(s.keepsake)}</p><a href="${escape(s.source)}" target="_blank" rel="noopener noreferrer">查看联合国教科文组织资料 ↗</a></article></details>`).join('');
}
render();el('search').oninput=render;el('theme').onchange=render;
el('poker').onclick=async()=>{
 const r=await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'demo'})});
 if(r.ok)location.assign('/#review=poker');else el('count').textContent='示例小屋暂时打不开，请刷新再试。';
};
