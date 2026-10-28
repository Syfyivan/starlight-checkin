import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {foodInventory,foodShelf,petMoment,careOutcome,newlyUnlocked} from '../public/pet-care.js';
import {petPortrait,wardrobePreview,petUI} from '../public/pets.js';
import {PET_FORMS} from '../lib/pets.mjs';
import {growthState} from '../public/pet-growth.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const pet=(extra={})=>({owned:true,form:'nuonuo-seal',stage:'young',growth:growthState(1,95),level:1,xp:95,outfit:'',outfits:['pet_bow'],forms:PET_FORMS,...extra});
const card=(id,effect,extra={})=>({id,effect,status:'ready',available:'2026-01-01',...extra});
const state=(extra={})=>({pet:pet(),cards:[],serverNow:Date.parse('2026-10-28'),travel:{away:false},balance:1000,...extra});

test('口粮按品种归拢，只选可用且未消费的那张，不泄露锁定口粮',()=>{
 const s=state({cards:[card('later','pet_snack',{available:'2027-01-01'}),card('ready','pet_snack'),card('used','pet_snack',{status:'used'}),card('soup','pet_soup'),card('hat','pet_beret')]});
 const groups=foodInventory(s);assert.equal(groups.length,2);assert.equal(groups[0].count,2);assert.equal(groups[0].ready,1);assert.equal(groups[0].card.id,'ready');assert.match(groups[1].lock,/Lv.4/);
 const html=foodShelf(s,esc);assert.match(html,/data-id="ready"/);assert.ok(!html.includes('data-id="later"'));assert.ok(!html.includes('暖呼呼蘑菇汤'));assert.match(html,/神秘口粮/);
 for(const patch of [{travel:{away:true}},{balance:-1},{serverNow:Date.parse('2025-01-01')}])assert.ok(foodInventory({...s,...patch}).every(g=>g.blocked));
});
test('衣橱预览不让低等级或未拥有的外形与配饰提前出现',()=>{
 const p=pet();assert.match(wardrobePreview(p,'nuonuo-seal','pet_bow'),/fitted-outfit/);assert.ok(!wardrobePreview(p,'pocket-glider','pet_crown').includes('pocket-glider/'));assert.ok(!wardrobePreview(p,'nuonuo-seal','pet_crown').includes('fitted-outfit'));
 const high=pet({level:10,growth:growthState(5,6000),outfits:['pet_moon']});assert.match(wardrobePreview(high,'nuonuo-seal','pet_moon'),/star.png/);assert.match(wardrobePreview(high,'pocket-glider','pet_moon'),/pocket-glider/);
});
test('喂食、蛋内温暖、破壳、成长与换装使用不同的反馈，配饰在同一身体层',()=>{
 const p=pet({outfit:'pet_bow'}),egg=pet({growth:growthState(0,0)}),spirit=pet({growth:growthState(3,2400)}),moon=pet({growth:growthState(4,3400)});
 for(const effect of ['pet_snack','pet_feast','pet_berry','pet_soup','pet_bento']){const html=petMoment(p,p,{kind:'feed',effect,portrait:petPortrait});assert.match(html,/moment-feed/);assert.equal((html.match(/class="moment-bite"/g)||[]).length,3);assert.match(html,/fitted-outfit/);}
 assert.match(petMoment(egg,egg,{kind:'feed',portrait:petPortrait}),/moment-warm/);
 assert.match(petMoment(egg,p,{kind:'evolve',portrait:petPortrait}),/moment-hatch/);
 assert.match(petMoment(p,spirit,{kind:'evolve',portrait:petPortrait}),/moment-cocoon/);
 assert.match(petMoment(spirit,moon,{kind:'evolve',portrait:petPortrait}),/moment-hatch/);
 for(const kind of ['dress','depart','welcome'])assert.ok(petMoment(p,p,{kind,portrait:petPortrait}).includes('moment-'+kind));
});
test('升级反馈只揭晓刚解锁的可用物品，跨级也不展示未完成套装',()=>{
 const before=pet(),after=pet({level:2,xp:100});assert.deepEqual(newlyUnlocked(before,after).map(i=>i.effect),['pet_berry','pet_scarf']);
 const html=careOutcome(before,after,5,esc,petPortrait);assert.match(html,/95 → 100/);assert.match(html,/奶油格子围巾/);assert.ok(!html.includes('栗子画家帽'));
 const all=careOutcome(before,pet({level:10,xp:6000}),5905,esc,petPortrait);assert.ok(!all.includes('雨后散步套装'));assert.ok(!all.includes('星际探险套装'));assert.match(all,/pocket-glider/);
});
test('失败的喂食请求不播放成功动画；成功后展示服务端真实经验',async()=>{
 let s=state({cards:[card('food','pet_snack')]}),html='',fail=true,calls=0;
 const ui=petUI({getState:()=>s,esc,canAct:()=>true,openDialog:(_title,b)=>{html=b;},actions:()=>'',mutation:async(route,body)=>{calls++;assert.equal(route,'pets/use');assert.equal(body.card_id,'food');if(fail)throw Error('旅行中');return {note:'吃饱饱',pet:pet({level:2,xp:100}),petXp:5};}});
 await assert.rejects(()=>ui.submit({id:'pet-use-form',dataset:{id:'food'}},{},'retry-key'),/旅行中/);assert.equal(html,'');
 fail=false;await ui.submit({id:'pet-use-form',dataset:{id:'food'}},{},'retry-key');assert.match(html,/moment-feed/);assert.match(html,/95 → 100/);assert.equal(calls,2);
});
test('减少动态模式直接显示最终结果，动画不会成为继续操作的门槛',()=>{
 const css=readFileSync(new URL('../public/pet-care.css',import.meta.url),'utf8');assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/animation:none!important/);assert.match(css,/\.moment-after\{opacity:1!important/);
 const js=readFileSync(new URL('../public/pet-care.js',import.meta.url),'utf8');assert.ok(!js.includes('setInterval'));assert.ok(!js.includes('requestAnimationFrame'));assert.ok(!js.includes('animationend'));
});
