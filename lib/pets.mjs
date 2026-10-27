import {id,now,requireThat} from './store.mjs';
import {COIN} from './common.mjs';
import {PET_ITEMS,petItemLock} from '../public/pet-catalog.js';
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
  state(space){
    const pet=this.s.get('SELECT * FROM pets WHERE space_id=?',space);
    const taskXp=this.s.get('SELECT COALESCE(SUM(points),0) n FROM completions WHERE space_id=? AND done=1',space).n/COIN;
    const bonusXp=this.s.get("SELECT COALESCE(SUM(amount),0) n FROM daily_bonuses WHERE space_id=? AND active=1 AND kind='coins'",space).n;
    const itemXp=this.s.get('SELECT COALESCE(SUM(amount),0) n FROM pet_experience WHERE space_id=?',space).n;
    const travelXp=this.s.get("SELECT COALESCE(SUM(xp),0) n FROM pet_trips WHERE space_id=? AND status='returned'",space).n;
    const xp=Math.max(0,Math.floor(taskXp+bonusXp+itemXp+travelXp)),level=petLevel(xp);
    const form=PET_FORMS.find(f=>f.id===pet?.form&&f.level<=level)?.id||PET_FORMS[0].id;
    return {owned:!!pet,xp,travelXp,taskXp:Math.floor(taskXp+bonusXp),itemXp,level,levelStart:PET_LEVELS[level-1],nextXp:PET_LEVELS[level]??null,form,outfit:pet?.outfit&&(!petItemLock({owned:!!pet,level},pet.outfit))?pet.outfit:'',forms:PET_FORMS,items:PET_ITEMS,outfits:this.s.all('SELECT effect FROM pet_outfits WHERE space_id=?',space).map(r=>r.effect),stage:level>=4?'winged':'young'};
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
    let xp=0,note='';
    if(card.effect==='pet_companion'){
      requireThat(card.source==='draw','小伙伴需要从抽奖中获得');
      const existing=this.s.get('SELECT space_id FROM pets WHERE space_id=?',space);
      if(existing){xp=60;note='小伙伴带回 60 经验';}
      else{this.s.run('INSERT INTO pets(space_id,form,outfit,created) VALUES(?,?,?,?)',space,PET_FORMS[0].id,'',now());note='糯糯海豹住进来啦';}
    }else{
      requireThat(this.s.get('SELECT space_id FROM pets WHERE space_id=?',space),'先遇见一位小伙伴吧，这张卡会替你留好');
      xp=item.xp;
      if(item.kind==='outfit'){
        const added=this.s.run('INSERT OR IGNORE INTO pet_outfits VALUES(?,?,?)',space,card.effect,now()).changes;
        if(!added)xp=0;
        this.s.run('UPDATE pets SET outfit=? WHERE space_id=?',card.effect,space);
        note=added?'新装扮已穿好':'已经拥有这件装扮，重新穿好啦（不重复加经验）';
      }else note='吃饱饱，又长大一点';
    }
    if(xp)this.s.run('INSERT INTO pet_experience VALUES(?,?,?,?,?)',id(),space,card.id,xp,now());
    this.s.run("UPDATE cards SET status='used',delivery_note=? WHERE id=?",note+(xp?' · +'+xp+' 经验':''),card.id);
    return {ok:true,usedCard:card.title,petXp:xp,note,pet:this.state(space)};
  }
  dress(user,body){
    const space=this.s.ownSpace(user,body),pet=this.state(space);
    requireThat(pet.owned,'先在抽奖中遇见小伙伴吧');
    requireThat(!this.s.get("SELECT id FROM pet_trips WHERE space_id=? AND status='away'",space),'小伙伴正在旅行，回来再换装吧');
    const form=body.form??pet.form,outfit=body.outfit??pet.outfit;
    if(outfit){const lock=petItemLock(pet,outfit);requireThat(!lock,lock);}
    requireThat(PET_FORMS.some(f=>f.id===form&&f.level<=pet.level),'再积攒一点经验，就能解锁这个形象啦');
    requireThat(outfit===''||pet.outfits.includes(outfit),'这件装扮还没有解锁');
    this.s.run('UPDATE pets SET form=?,outfit=? WHERE space_id=?',form,outfit,space);
    return {ok:true,pet:this.state(space),note:'已换上喜欢的模样'};
  }
}
