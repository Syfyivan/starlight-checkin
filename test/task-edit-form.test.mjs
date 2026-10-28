import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TASK_TYPES,REPEAT_OPTIONS,LONG_POINTS_MAX,taskKind} from '../public/task-types.js';
import {QUADRANTS} from '../public/plans.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function form(){
 let captured;const state={day:'2026-10-28',settings:{taskScoreMode:'manual',defaultPoints:20,defaultDifficulty:'standard'}};
 const context={TASK_TYPES,REPEAT_OPTIONS,LONG_POINTS_MAX,taskKind,QUADRANTS,state,UNIT:1e6,errorSlot:'',document:{querySelectorAll:()=>[]},canAct:()=>true,icon:()=>'',coins:n=>n/1e6,esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),openDialog:(title,html)=>{captured={title,html};}};
 for(const name of ['field','select','actions','scoreFields','scoreGuide','taskEditButton','taskOptions','updateTaskOptions','readTaskOptions','taskDialog']){const begin=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',begin+1);assert.ok(begin>=0&&end>begin);vm.runInNewContext(source.slice(begin,end),context);}
 return {context,render:t=>{context.taskDialog(t);return captured.html;}};
}
test('编辑表单回填原类型、周期、日期和预估时间，保留版本且转义任务名称',()=>{
 const {render,context}=form(),html=render({id:'task',editVersion:'version',title:'<img onerror="bad">',task_kind:'repeat',repeat_days:7,start_date:'2026-10-20',category:'运动',quadrant:'urgent-important',points:20e6,estimated_minutes:15});
 assert.match(html,/id="task-edit-form" data-id="task" data-version="version"/);assert.match(html,/value="repeat" selected/);assert.match(html,/value="7" selected/);assert.match(html,/value="2026-10-20"/);assert.match(html,/name="estimated_minutes"[^>]*value="15"/);assert.ok(!html.includes('<img'));assert.match(html,/保存修改/);
 assert.match(context.taskEditButton({id:'task',title:'单词'}),/编辑任务：单词/);assert.equal(context.taskEditButton({id:'task',archived:1}),'');assert.match(render(),/id="task-form"/);
});
test('类型转换序列化正确，高额长期任务不把旧完成分数灌进普通任务输入框',()=>{
 const {render,context}=form(),html=render({id:'task',editVersion:'v',task_kind:'long',points:5000e6,nominal_points:5000e6,start_date:'2026-10-28'});
 assert.match(html,/name="long_points"[^>]*value="5000"/);assert.match(html,/name="points"[^>]*value="100"/);
 const read=data=>JSON.parse(JSON.stringify(context.readTaskOptions(data)));
 assert.equal(read({task_kind:'repeat',repeat_days:'2',points:'20'}).repeat_days,2);assert.equal(read({task_kind:'repeat',repeat_days:'1',points:'20'}).recurrence,'daily');assert.equal(read({task_kind:'long',long_points:'8000',deadline:'2026-11-10'}).points,8000);assert.equal(read({task_kind:'normal',points:'20',deadline:'2026-11-10'}).deadline,'');
});
