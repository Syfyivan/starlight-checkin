import {randomInt} from 'node:crypto';
import {id,requireThat} from './store.mjs';
import {PET_ITEMS} from './pets.mjs';

const HOUR=3600_000,DAY=24*HOUR;
export const TRAVEL_DURATION_ODDS=[
  {hours:12,probability:.5},{hours:24,probability:.3},
  {hours:48,probability:.15},{hours:72,probability:.05}
];
export const TRAVEL_GIFT_ODDS=[
  {kind:'story',title:'带回旅行见闻',probability:.7},
  {kind:'ticket',title:'见闻 + 1 次抽奖机会',probability:.2},
  {kind:'food',title:'见闻 + 一口云朵粮',probability:.08},
  {kind:'outfit',title:'见闻 + 莓莓蝴蝶结',probability:.02}
];

// These are fictional postcards, not reports of current events. Facts and sources
// are kept with the departure snapshot so a later copy edit cannot change a trip.
export const TRAVEL_STORIES=[
  {id:'great-wall',place:'中国 · 长城',source:'https://whc.unesco.org/en/list/438/',story:'我把小背包放在膝头，望着山脊上的长城发了一会儿呆。今天学到：长城不是一次建好的，早期城墙曾被连接起来，修筑一直延续到明代。原来很大的事情，也能由很多人的一小步接起来。'},
  {id:'fujian-tulou',place:'中国 · 福建土楼',source:'https://whc.unesco.org/en/list/1113/',story:'我在想象中的土楼院子里转了一圈，差点把自己的脚印绕成花。土楼有圆的，也有方的，许多家庭围着中央院子一起生活。一个大屋子，也可以像一座热热闹闹的小村庄。'},
  {id:'lijiang',place:'中国 · 丽江古城',source:'https://whc.unesco.org/en/list/811/',story:'我给自己安排了一场听流水的小散步。丽江古城有古老而巧妙的供水系统，建筑也融合了不同文化的特点。今天的小发现是：水流会拐弯，解决问题也可以换一条路呀。'},
  {id:'kyoto',place:'日本 · 京都',source:'https://whc.unesco.org/en/list/688/',story:'我坐在想象中的庭园边，把脚步放得很轻。京都建城于公元794年，木结构建筑和庭园艺术是它的重要文化特色。我想把这份安静折进信里，陪你慢慢做好下一件事。'},
  {id:'taj-mahal',place:'印度 · 阿格拉',source:'https://whc.unesco.org/en/list/252/',story:'我在旅行本上画了一座白色的建筑，画得有点像云朵。阿格拉的泰姬陵主要用白色大理石建成，是沙贾汗为纪念妻子建造的陵墓。今天认识了一种石材，也认识了建筑里保存的思念。'},
  {id:'quirigua',place:'危地马拉 · 基里瓜',source:'https://whc.unesco.org/en/list/149/',story:'我的小本子今天装下了一个新词：石碑。基里瓜遗址保存着玛雅人的雕刻石碑和石刻历法，是了解玛雅文明的重要资料。原来很久以前的人，也认真把自己的故事留下来了。'},
  {id:'niokolo-koba',place:'塞内加尔 · 尼奥科罗-科巴',source:'https://whc.unesco.org/en/list/153/',story:'今天的想象旅行，我把望远镜举得高高的。尼奥科罗-科巴国家公园沿着冈比亚河分布着河岸森林和稀树草原，多种野生动物在这里生活。我只远远观察，把安静的家留给它们。'},
  {id:'los-glaciares',place:'阿根廷 · 冰川国家公园',source:'https://whc.unesco.org/en/list/145/',story:'我在旅行本上画了好多蓝白色的小方块。阿根廷的冰川国家公园有高山、冰川和冰川湖，冰块可以从冰川边缘落进湖里。今天又认识了一种慢慢改变山水的力量。'}
];

function pick(entries,random){
  let value=random(10000);requireThat(Number.isInteger(value)&&value>=0&&value<10000,'旅行抽签暂时走神啦，请稍后再试',503);
  for(const entry of entries){value-=Math.round(entry.probability*10000);if(value<0)return entry;}
  throw new Error('Travel probabilities must total 100%');
}
function storyOf(trip){return JSON.parse(trip.story);}
function publicTrip(trip,at){
  return trip?{id:trip.id,departure:trip.departure,returnAt:trip.return_at,durationHours:trip.duration_hours,xp:trip.xp,destination:trip.destination,remainingMs:Math.max(0,trip.return_at-at),supplies:JSON.parse(trip.supplies)}:null;
}

export class Travel {
  constructor(store){this.s=store;}
  atomic(fn){
    this.s.db.exec('SAVEPOINT pet_travel');
    try{const result=fn();this.s.db.exec('RELEASE pet_travel');return result;}
    catch(error){this.s.db.exec('ROLLBACK TO pet_travel; RELEASE pet_travel');throw error;}
  }
  state(space,at=Date.now()){
    const owned=!!this.s.get('SELECT space_id FROM pets WHERE space_id=?',space);
    const room=this.s.get('SELECT status FROM spaces WHERE id=?',space);
    const trip=this.s.get("SELECT * FROM pet_trips WHERE space_id=? AND status='away'",space);
    const latest=this.s.get("SELECT * FROM pet_trips WHERE space_id=? AND status='returned' ORDER BY return_at DESC LIMIT 1",space);
    const supplies=this.s.all("SELECT c.id,c.title,c.effect,c.emoji,c.available FROM cards c JOIN spaces s ON s.id=c.space_id WHERE c.space_id=? AND c.user_id=s.learner_id AND c.status='ready'",space)
      .filter(c=>['food','gear'].includes(PET_ITEMS[c.effect]?.kind)&&Date.parse(c.available)<=at)
      .map(c=>({id:c.id,title:c.title,effect:c.effect,emoji:c.emoji,kind:PET_ITEMS[c.effect].kind,xp:PET_ITEMS[c.effect].xp}));
    const blocked=!owned?'先在抽奖里遇见一位小伙伴吧':room?.status!=='active'?'小屋已收起，旅途来信仍会送到':trip?'小伙伴正在旅行，等它回来再出发吧':this.s.balance(space)<0?'先补足学习币待补余额吧':!supplies.length?'先去商城准备一份口粮或行囊吧':'';
    return {owned,away:!!trip,trip:publicTrip(trip,at),lastTrip:latest?{id:latest.id,returnAt:latest.return_at,returnedAt:storyOf(latest).deliveredAt||latest.return_at,xp:latest.xp,destination:latest.destination,mailId:latest.mail_id}:null,supplies,durationOdds:TRAVEL_DURATION_ODDS,giftOdds:TRAVEL_GIFT_ODDS,canDepart:!blocked,blocked};
  }
  depart(user,body,random=randomInt,at=Date.now()){
    return this.atomic(()=>{
      const space=this.s.ownSpace(user,body);
      requireThat(this.s.get('SELECT space_id FROM pets WHERE space_id=?',space),'先在抽奖里遇见一位小伙伴吧');
      requireThat(!this.s.get("SELECT id FROM pet_trips WHERE space_id=? AND status='away'",space),'小伙伴已经出门啦，等它回来再准备下一趟',409);
      requireThat(this.s.balance(space)>=0,'先补足学习币待补余额吧');
      const ids=body.card_ids;
      requireThat(Array.isArray(ids)&&ids.length>=1&&ids.length<=2&&ids.every(v=>typeof v==='string')&&new Set(ids).size===ids.length,'准备 1–2 件不同种类的行囊吧');
      const cards=ids.map(cardId=>this.s.get('SELECT * FROM cards WHERE id=? AND user_id=? AND space_id=?',cardId,user.id,space));
      requireThat(cards.every(c=>c&&c.status==='ready'&&Date.parse(c.available)<=at),'只能带上本屋里已经可用、还没使用的卡片',409);
      const supplies=cards.map(c=>{const item=PET_ITEMS[c.effect];requireThat(item&&['food','gear'].includes(item.kind),'行囊里可以放口粮和旅行用品，装扮留在衣橱就好');return {id:c.id,title:c.title,effect:c.effect,emoji:c.emoji,kind:item.kind,xp:item.xp};});
      requireThat(new Set(supplies.map(s=>s.kind)).size===supplies.length,'每趟最多带一份口粮、一件旅行用品');
      const duration=pick(TRAVEL_DURATION_ODDS,random),storyIndex=random(TRAVEL_STORIES.length);
      requireThat(Number.isInteger(storyIndex)&&storyIndex>=0&&storyIndex<TRAVEL_STORIES.length,'旅行目的地暂时走神啦，请稍后再试',503);
      const story=TRAVEL_STORIES[storyIndex],chosen=pick(TRAVEL_GIFT_ODDS,random);
      let gift=chosen.kind==='ticket'?{kind:'ticket',amount:1,title:'旅行捎来的抽奖机会'}:chosen.kind==='food'?{kind:'item',amount:1,effect:'pet_snack',title:PET_ITEMS.pet_snack.name}:chosen.kind==='outfit'?{kind:'item',amount:1,effect:'pet_bow',title:PET_ITEMS.pet_bow.name}:null;
      gift=this.withoutDuplicateOutfit(space,gift);
      const tripId=id(),xp=supplies.reduce((sum,s)=>sum+s.xp,0);
      this.s.run('INSERT INTO pet_trips(id,space_id,departure,return_at,duration_hours,xp,supplies,destination,story,gift,status,mail_id,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',tripId,space,at,at+duration.hours*HOUR,duration.hours,xp,JSON.stringify(supplies),story.place,JSON.stringify(story),JSON.stringify(gift),'away',null,new Date(at).toISOString());
      for(const card of cards){const result=this.s.run("UPDATE cards SET status='used',delivery_note=? WHERE id=? AND status='ready'",'装入旅行行囊 · 经验随归来信送达',card.id);requireThat(result.changes===1,'行囊卡刚刚有变化，请重新选择',409);}
      this.s.community.audit(user,space,'pet.travel.depart','为小伙伴准备行囊，出发旅行',{tripId,destination:story.place,durationHours:duration.hours,xp,supplies});
      const travel=this.state(space,at);
      return {ok:true,trip:travel.trip,travel,note:`小伙伴出发啦，约 ${duration.hours/24} 天后带着见闻回来`};
    });
  }
  withoutDuplicateOutfit(space,gift){
    if(gift?.kind==='item'&&PET_ITEMS[gift.effect]?.kind==='outfit'&&(
      this.s.get('SELECT effect FROM pet_outfits WHERE space_id=? AND effect=?',space,gift.effect)||
      this.s.get("SELECT id FROM cards WHERE space_id=? AND effect=? AND status='ready'",space,gift.effect)))return {kind:'item',amount:1,effect:'pet_snack',title:PET_ITEMS.pet_snack.name};
    return gift;
  }
  maintain(at=Date.now()){
    return this.atomic(()=>{
      const returned=[];
      for(const trip of this.s.all("SELECT t.*,s.learner_id FROM pet_trips t JOIN spaces s ON s.id=t.space_id WHERE t.status='away' AND t.return_at<=? ORDER BY t.return_at,t.id",at)){
        const story=storyOf(trip),gift=this.withoutDuplicateOutfit(trip.space_id,JSON.parse(trip.gift));
        const text=story.story+`\n\n这趟行囊带来了 ${trip.xp} 经验。`+(gift?'我还捎回一份小礼物，记得收下呀。':'这次没有捎来额外礼物，先把见闻和拥抱交给你。')+'\n\n这是一封虚构的宠物旅行故事，里面的小知识来自 UNESCO 世界遗产中心。';
        const mailId=this.s.progress.mail(trip.space_id,'travel_return','travel-return:'+trip.id,'小伙伴从'+trip.destination+'回来啦',text,gift,{tripId:trip.id,xp:trip.xp,destination:trip.destination,sourceUrl:story.source,sourceTitle:'UNESCO 世界遗产中心',fictional:true});
        this.s.run("UPDATE pet_trips SET status='returned',mail_id=?,gift=?,story=? WHERE id=? AND status='away'",mailId,JSON.stringify(gift),JSON.stringify({...story,deliveredAt:at}),trip.id);
        const learner=this.s.get('SELECT id,name FROM users WHERE id=?',trip.learner_id);
        this.s.community.audit(learner,trip.space_id,'pet.travel.return','小伙伴旅行归来 · '+trip.destination,{tripId:trip.id,xp:trip.xp,gift,automatic:true});
        returned.push(trip.id);
      }
      for(const pet of this.s.all("SELECT p.space_id,p.created FROM pets p JOIN spaces s ON s.id=p.space_id WHERE s.status='active' AND NOT EXISTS(SELECT 1 FROM pet_trips t WHERE t.space_id=p.space_id AND t.status='away')")){
        const latest=this.s.get("SELECT * FROM pet_trips WHERE space_id=? AND status='returned' ORDER BY return_at DESC LIMIT 1",pet.space_id);
        const anchor=latest?(storyOf(latest).deliveredAt||latest.return_at)+DAY:Date.parse(pet.created);
        if(!Number.isFinite(anchor)||at<anchor)continue;
        const week=Math.floor((at-anchor)/(7*DAY)),eventKey='travel-invite:'+pet.space_id+':'+anchor+':'+week;
        this.s.progress.mail(pet.space_id,'travel_invite',eventKey,'小伙伴想去看看世界','我想背着小行囊去看看世界，回来给你写一封信。愿意的话，去商城挑一份口粮或旅行用品，再到小伙伴这里帮我打包吧。每次旅行约半天到三天，行囊带来的经验会在回来时送到。',null,{action:'travel'});
      }
      return {returned:returned.length,tripIds:returned};
    });
  }
}
