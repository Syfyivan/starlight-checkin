import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studyWeek,newestStudyStamp} from '../public/progress.js';

test('stamps use distinct task days in this room, including earlier weeks',()=>{
  const history=[
    {day:'2026-10-02',count:3}, {day:'2026-11-08',count:1},
    {day:'2026-11-09',count:4}, {day:'2026-11-09',count:1},
    {day:'2026-11-10',count:0}, {day:'2026-11-13',count:1}
  ];
  const today='2026-11-11';
  const {unlocked,week}=studyWeek(history,today);
  assert.deepEqual(unlocked.map(row=>row.days),[1,3]);
  assert.deepEqual(week.filter(row=>row.done).map(row=>row.day),['2026-11-09']);
  assert.equal(week.at(-1).day,'2026-11-15');
  assert.equal(newestStudyStamp(history,history,today),undefined);
  assert.equal(newestStudyStamp(history.slice(0,2),history,today),'福建土楼');
});
