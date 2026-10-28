import {id,now,requireThat} from './store.mjs';
import {COIN} from './common.mjs';
import {PET_ITEMS,petItemLock} from '../public/pet-catalog.js';
import {growthState,PET_GROWTH_STAGES} from '../public/pet-growth.js';
export {PET_ITEMS};

export const PET_FORMS=[
  {id:'nuonuo-seal',name:'糯糯海豹',level:1,hint:'一颗会陪你长大的糯米团'},
  {id:'pocket-glider',name:'兜兜鼯鼠',level:3,hint:'把今天的小收获装进核桃兜'},
  {id:'cottonpod-hermit',name:'棉桃寄居蟹',level:5,hint:'背着软绵绵的小屋去散步'}
];
export const PET_LEVELS=[0,100,300,600,1000,1600,2400,3400,4600,6000];
export const PET_EFFECTS=['pet_companion',...Object.keys(PET_ITEMS)];
export const PET_TEMPLATES=Object.entries(PET_ITEMS).filter(([,p])=>p.ready!==false).map(([effect,p])=>({template_id:effect,category:'custom',effect,title:p.name,description:p.kind==='gear'?`旅行时带上，返回增加 ${p.xp} 经验；每趟只带一件装备。`:p.kind==='food'?`给宠物吃一份，增加 ${p.xp} 经验。虚拟食品，不含报销额度。`:`解锁可反复佩戴的装扮，首次解锁增加 ${p.xp} 经验。虚拟装扮，不含报销额度。`,face_cents:0,cost:p.cost,tier:p.kind==='gear'?'旅行行囊':p.kind==='food'?'宠物口粮':'宠物衣橱',emoji:p.emoji,tone:'peach',stock:20,weight:0,wait_days:0,active:true}));

export function petLevel(xp){return PET_LEVELS.reduce((level,min,i)=>xp>=min?i+1:level,1);}
export class Pets {
  constructor(store){this.s=store;}
  isPersonal(space){const r=this.s.get('SELECT giver_id,family_id,legacy_self,status FROM spaces WHERE id=?',space);return !!r&&!r.giver_id&&!r.family_id&&!r.legacy_self&&r.status==='active';}
  personalShop(space){
    if(!this.isPersonal(space)||!this.s.get('SELECT space_id FROM pets WHERE space_id=?',space))return null;
    return PET_TEMPLATES.map(p=>({...p,id:'personal-pet:'+p.effect,room_id:space,channel:'shop',cost:p.cost*COIN,stock:10000,removed:0,personal_pet:true}));
  }
  personalPool(space){
    if(!this.personalShop(space))return null;
    const entries=[['pet_snack',3000],['pet_feast',1500],['pet_bow',500],['pet_companion',500],['extra_draw',500]];
    return [{id:null,title:'下次好运',emoji:'☘️',weight:4000,probability:.4},...entries.map(([effect,weight])=>{
      const base=PET_TEMPLATES.find(p=>p.effect===effect)||{title:effect==='pet_companion'?'小伙伴的成长礼':'好运续杯',description:effect==='pet_companion'?'已有伙伴时，使用增加 60 经验。':'存入一次免费机会，不会自动连抽。',emoji:effect==='pet_companion'?'🐾':'🎟️',cost:100,tone:'mint',tier:'个人宠物惊喜',face_cents:0,category:'custom',wait_days:0};
      return {...base,id:'personal-lottery:'+space+':'+effect,room_id:space,effect,channel:'lottery',active:1,removed:0,stock:10000,weight,probability:weight/10000,cost:base.cost*COIN};
    })];
  }
  issuePersonal(user,prize,source){
    const space=this.s.ownSpace(user,{space_id:prize.room_id});
    const canonical=this.personalPool(space)?.find(p=>p.id&&p.id===prize.id);
    requireThat(source==='draw'&&canonical,'这份个人惊喜暂时不可用',403);
    this.s.run(`INSERT OR IGNORE INTO prizes(id,title,description,emoji,tone,cost,stock,weight,wait_days,active,room_id,category,face_cents,tier,effect,channel,removed) VALUES(?,?,?,?,?,?,10000,0,0,0,?,'custom',0,?,?,'lottery',1)`,canonical.id,canonical.title,canonical.description,canonical.emoji,canonical.tone,canonical.cost,space,canonical.tier,canonical.effect);
    return this.s.writeCard(user,canonical,source,{space_id:space});
  }
  buyPersonal(user,body){
    const space=this.s.ownSpace(user,body),effect=String(body.prize_id).slice('personal-pet:'.length),item=PET_ITEMS[effect];
    requireThat(this.isPersonal(space),'这份个人用品只能在自己的个人空间购买',403);
    requireThat(item&&item.ready!==false,'这份宠物用品还没准备好',404);
    this.canBuy(space,effect);
    const cost=item.cost*COIN;
    if(body.expectedCost!==undefined)requireThat(body.expectedCost===cost,'用品价格已更新，请刷新后重试',409);
    requireThat(this.s.balance(space)>=cost,'学习币不足');
    const template=PET_TEMPLATES.find(p=>p.effect===effect),pid='personal-pet:'+space+':'+effect;
    // Only server-defined virtual supplies use this path; it never grants prize-management rights.
    this.s.run(`INSERT OR IGNORE INTO prizes(id,title,description,emoji,tone,cost,stock,weight,wait_days,active,room_id,category,face_cents,tier,effect,channel) VALUES(?,?,?,?,?,?,10000,0,0,1,?,'custom',0,?,?,'shop')`,pid,template.title,template.description,template.emoji,template.tone,cost,space,template.tier,effect);
    const prize={...this.s.get('SELECT * FROM prizes WHERE id=?',pid),...template,id:pid,room_id:space,cost};
    const card=this.s.writeCard(user,prize,'shop',{space_id:space});
    this.s.post(space,-cost,'shop','个人宠物小铺 · '+template.title,card.id);
    return {ok:true,card};
  }
  state(space){
    const pet=this.s.get('SELECT * FROM pets WHERE space_id=?',space);
    const taskXp=this.s.get('SELECT COALESCE(SUM(points),0) n FROM completions WHERE space_id=? AND done=1',space).n/COIN;
    const bonusXp=this.s.get("SELECT COALESCE(SUM(amount),0) n FROM daily_bonuses WHERE space_id=? AND active=1 AND kind='coins'",space).n;
    const itemXp=this.s.get('SELECT COALESCE(SUM(amount),0) n FROM pet_experience WHERE space_id=?',space).n;
    const travelXp=this.s.get("SELECT COALESCE(SUM(xp),0) n FROM pet_trips WHERE space_id=? AND status='returned'",space).n;
    const xp=Math.max(0,Math.floor(taskXp+bonusXp+itemXp+travelXp)),level=petLevel(xp);
    const form=PET_FORMS.find(f=>f.id===pet?.form&&f.level<=level)?.id||PET_FORMS[0].id;
    const growth=pet?growthState(this.s.get('SELECT stage FROM pet_growth WHERE space_id=?',space)?.stage??(level>=4?2:1),xp):null;
    return {owned:!!pet,xp,travelXp,taskXp:Math.floor(taskXp+bonusXp),itemXp,level,levelStart:PET_LEVELS[level-1],nextXp:PET_LEVELS[level]??null,form,outfit:pet?.outfit&&(!petItemLock({owned:!!pet,level},pet.outfit))?pet.outfit:'',forms:PET_FORMS,items:PET_ITEMS,outfits:this.s.all('SELECT effect FROM pet_outfits WHERE space_id=?',space).map(r=>r.effect),stage:level>=4?'winged':'young',growth};
  }
  evolve(user,body){
    const space=this.s.ownSpace(user,body),pet=this.state(space);
    requireThat(pet.owned,'先在抽奖中遇见小伙伴吧');
    requireThat(!this.s.get("SELECT id FROM pet_trips WHERE space_id=? AND status='away'",space),'小伙伴正在旅行，回来再迎接成长吧',409);
    requireThat(pet.form==='nuonuo-seal','先在小衣橱换回糯糯海豹，其他伙伴的成长线还在准备');
    requireThat(body.from===pet.growth.stage,'成长状态已经变化，刷新后再看看吧',409);
    requireThat(pet.growth.next,'已经是星海伙伴啦，继续一起积攒回忆吧');
    requireThat(pet.growth.next.eligible,'再积攒 '+pet.growth.next.remaining+' 经验，就能迎接下一段成长');
    const stage=pet.growth.stage+1;
    this.s.run('INSERT INTO pet_growth(space_id,stage,updated) VALUES(?,?,?) ON CONFLICT(space_id) DO UPDATE SET stage=excluded.stage,updated=excluded.updated',space,stage,now());
    this.s.community.audit(user,space,'pet.evolve','小伙伴成长为'+PET_GROWTH_STAGES[stage].name,{from:pet.growth.stage,to:stage,xp:pet.xp});
    return {ok:true,note:stage===3?'星辉灵蛋，藏着新的相遇':stage===1||stage===4?'你好呀，新的小模样':'又一起长大了一点',pet:this.state(space)};
  }
  canBuy(space,effect){
    requireThat(effect!=='pet_companion','第一位小伙伴只能从抽奖中遇见');
    const item=PET_ITEMS[effect];if(!item)return;
    requireThat(this.s.get('SELECT space_id FROM pets WHERE space_id=?',space),'先在抽奖中遇见小伙伴，再来准备口粮和装扮吧');
    const lock=petItemLock(this.state(space),effect);requireThat(!lock,lock);
    if(item.kind==='outfit')requireThat(!this.s.get('SELECT effect FROM pet_outfits WHERE space_id=? AND effect=?',space,effect)&&!this.s.get("SELECT id FROM cards WHERE space_id=? AND effect=? AND status='ready'",space,effect),'这件装扮已经在衣橱或卡包里啦，不用重复买');
  }
  use(user,body){
    const {space,card}=this.s.lottery.ready(user,body),item=PET_ITEMS[card.effect];
    requireThat(PET_EFFECTS.includes(card.effect),'这张卡不是宠物卡');
    requireThat(item?.kind!=='gear','行囊留给旅行使用，到成长伙伴里准备出发吧');
    requireThat(!this.s.get("SELECT id FROM pet_trips WHERE space_id=? AND status='away'",space),'小伙伴正在旅行，等它回来再喂食或换装吧');
    if(item){const lock=petItemLock(this.state(space),card.effect);requireThat(!lock,lock);}
    if(item?.kind==='outfit')requireThat(!this.state(space).growth?.isEgg,'先孵化小伙伴，再把装扮穿好吧');
    let xp=0,note='';
    if(card.effect==='pet_companion'){
      requireThat(card.source==='draw','小伙伴需要从抽奖中获得');
      const existing=this.s.get('SELECT space_id FROM pets WHERE space_id=?',space);
      if(existing){xp=60;note='小伙伴带回 60 经验';}
      else{this.s.run('INSERT INTO pets(space_id,form,outfit,created) VALUES(?,?,?,?)',space,PET_FORMS[0].id,'',now());this.s.run('INSERT INTO pet_growth(space_id,stage,updated) VALUES(?,0,?)',space,now());note='云朵蛋来敲门啦';}
    }else{
      requireThat(this.s.get('SELECT space_id FROM pets WHERE space_id=?',space),'先遇见一位小伙伴吧，这张卡会替你留好');
      xp=item.xp;
      if(item.kind==='outfit'){
        const added=this.s.run('INSERT OR IGNORE INTO pet_outfits VALUES(?,?,?)',space,card.effect,now()).changes;
        if(!added)xp=0;
        this.s.run('UPDATE pets SET outfit=? WHERE space_id=?',card.effect,space);
        note=added?'新装扮已穿好':'已经拥有这件装扮，重新穿好啦（不重复加经验）';
      }else note=this.state(space).growth?.isEgg?'暖乎乎的，蛋里的伙伴也在长大':'吃饱饱，又长大一点';
    }
    if(xp)this.s.run('INSERT INTO pet_experience VALUES(?,?,?,?,?)',id(),space,card.id,xp,now());
    this.s.run("UPDATE cards SET status='used',delivery_note=? WHERE id=?",note+(xp?' · +'+xp+' 经验':''),card.id);
    return {ok:true,usedCard:card.title,petXp:xp,note,pet:this.state(space)};
  }
  dress(user,body){
    const space=this.s.ownSpace(user,body),pet=this.state(space);
    requireThat(pet.owned,'先在抽奖中遇见小伙伴吧');
    requireThat(!pet.growth?.isEgg,'先孵化小伙伴，再来换装吧');
    requireThat(!this.s.get("SELECT id FROM pet_trips WHERE space_id=? AND status='away'",space),'小伙伴正在旅行，回来再换装吧');
    const form=body.form??pet.form,outfit=body.outfit??pet.outfit;
    if(outfit){const lock=petItemLock(pet,outfit);requireThat(!lock,lock);}
    requireThat(PET_FORMS.some(f=>f.id===form&&f.level<=pet.level),'再积攒一点经验，就能解锁这个形象啦');
    requireThat(outfit===''||pet.outfits.includes(outfit),'这件装扮还没有解锁');
    this.s.run('UPDATE pets SET form=?,outfit=? WHERE space_id=?',form,outfit,space);
    return {ok:true,pet:this.state(space),note:'已换上喜欢的模样'};
  }
}
