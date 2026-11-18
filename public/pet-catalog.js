// Unified catalog for pet food, travel gear, multi-slot wardrobe, outfit sets and cottage themes.
export const OUTFIT_SLOTS=[
  ['head','头饰'],['neck','颈饰与披肩'],['body','随身配饰'],['companion','身旁小伴']
];

export const COTTAGE_THEMES=[
  {id:'sunny',name:'暖阳午后',level:1,desc:'森林窗外的金灿灿日光'},
  {id:'blossom',name:'春樱微风',level:2,desc:'微风拂过窗棂，落入几瓣粉樱'},
  {id:'rain',name:'听雨屋檐',level:4,desc:'细雨轻敲木窗，屋内格外安宁'},
  {id:'starlight',name:'星夜灯火',level:6,desc:'夜色星河低垂，桌上油灯暖黄'}
];

export const PET_SETS={
  garden:{name:'春日野餐集',badge:'🌼 花园微风',items:['pet_flower','pet_bow','pet_clover','pet_sprout','pet_wings'],min:2,bonus:'旅行偶遇自然小动物的概率提升'},
  artist:{name:'写生漫游家',badge:'🎨 旅途速写',items:['pet_beret','pet_camera','pet_guitar'],min:2,bonus:'旅行归来明信片额外获得 +10 速写经验'},
  scholar:{name:'墨香小书院',badge:'🎓 博学星火',items:['pet_scholar','pet_glasses','pet_firefly'],min:2,bonus:'人文路线旅行更易带回珍藏见闻礼'},
  wanderer:{name:'远方小邮差',badge:'💌 翻山越岭',items:['pet_scarf','pet_satchel','pet_knit'],min:2,bonus:'旅行途中回信额外获得 +8 默契经验'},
  rain:{name:'雨后散步礼',badge:'🌧️ 听雨踏水',items:['pet_rainhat','pet_raincoat','pet_ducky'],min:2,bonus:'激活小屋与明信片晶莹雨露光效'},
  space:{name:'星海远航家',badge:'🪐 漫游星河',items:['pet_helmet','pet_space','pet_planet','pet_witch'],min:2,bonus:'旅行明信片更易邂逅璀璨星夜时辰'},
  seaside:{name:'海风假日集',badge:'🏖️ 晴空踏浪',items:['pet_straw','pet_sailor','pet_shell_lei','pet_sunglass','pet_balloon'],min:2,bonus:'海岸与岛屿路线更易带回晴空明信片'},
  cozy:{name:'暖冬茸茸集',badge:'🧸 壁炉暖绒',items:['pet_ears','pet_collar','pet_pearls','pet_rose','pet_cat','pet_snowman'],min:2,bonus:'小屋日常互动更易触发暖心悄悄话'}
};

export const PET_ITEMS={
  // Starter & classic supplies (preserve exact level:1 invariants)
  pet_pack:{name:'轻巧远行袋',xp:15,cost:20,emoji:'🎒',kind:'gear',level:1,art:'pack'},
  pet_tent:{name:'星光露营包',xp:40,cost:60,emoji:'⛺',kind:'gear',level:1,art:'tent'},
  pet_snack:{name:'一口云朵粮',xp:5,cost:10,emoji:'🥣',kind:'food',level:1,art:'bowl'},
  pet_feast:{name:'元气野餐盒',xp:20,cost:30,emoji:'🧺',kind:'food',level:1,art:'picnic'},
  pet_bow:{name:'莓莓蝴蝶结',xp:30,cost:50,emoji:'🎀',kind:'outfit',level:1,art:'bow',slot:'neck',set:'garden'},
  pet_star:{name:'星星小徽章',xp:50,cost:80,emoji:'⭐',kind:'outfit',level:1,art:'star',slot:'body',anchor:'pin'},

  // Level 2+ foods & gears (preserve Lv.2 unlock list invariant)
  pet_berry:{name:'莓果小点心',xp:12,cost:20,emoji:'🫐',kind:'food',level:2,art:'berry'},
  pet_sketchbook:{name:'水彩速写本',xp:22,cost:30,emoji:'📒',kind:'gear',level:2,art:'sketchbook'},
  pet_map:{name:'风的旅行手账',xp:25,cost:35,emoji:'🗺️',kind:'gear',level:3,art:'map'},
  pet_soup:{name:'暖呼呼蘑菇汤',xp:28,cost:45,emoji:'🍲',kind:'food',level:4,art:'soup'},
  pet_compass:{name:'观星小罗盘',xp:45,cost:65,emoji:'🧭',kind:'gear',level:4,art:'compass'},
  pet_lantern:{name:'月光小提灯',xp:60,cost:85,emoji:'🏮',kind:'gear',level:5,art:'lantern'},
  pet_bento:{name:'森林便当盒',xp:45,cost:70,emoji:'🍱',kind:'food',level:6,art:'bento'},

  // Travel-exclusive regional specialty treats (shop: false -> dropped by Pet Travel 2.0!)
  pet_matcha:{name:'宇治抹茶团子',xp:26,cost:40,emoji:'🍡',kind:'food',level:1,art:'matcha',shop:false,specialty:'东亚庭园风物'},
  pet_naan:{name:'丝路果仁小馕',xp:30,cost:45,emoji:'🥮',kind:'food',level:1,art:'naan',shop:false,specialty:'丝路绿洲风物'},
  pet_cocoa:{name:'安第斯暖可可',xp:32,cost:48,emoji:'☕',kind:'food',level:1,art:'cocoa',shop:false,specialty:'高山云林风物'},
  pet_gelato:{name:'海风柠檬冰沙',xp:28,cost:42,emoji:'🍧',kind:'food',level:1,art:'gelato',shop:false,specialty:'蔚蓝海岸风物'},

  // Multi-slot rich wardrobe: 36 outfits across head (11), neck (10), body (8), companion (7)
  pet_scarf:{name:'奶油格子围巾',xp:35,cost:60,emoji:'🧣',kind:'outfit',level:2,art:'scarf',slot:'neck',set:'wanderer'},
  pet_rainhat:{name:'晴雨荷叶帽',xp:35,cost:55,emoji:'🍃',kind:'outfit',level:2,art:'rainhat',slot:'head',set:'rain'},
  pet_glasses:{name:'博学圆框镜',xp:38,cost:65,emoji:'👓',kind:'outfit',level:2,art:'glasses',slot:'body',anchor:'face',set:'scholar'},

  pet_flower:{name:'雏菊悄悄开',xp:40,cost:65,emoji:'🌼',kind:'outfit',level:3,art:'flower',slot:'head',set:'garden'},
  pet_sprout:{name:'幸运双叶芽',xp:42,cost:68,emoji:'🌱',kind:'outfit',level:3,art:'sprout',slot:'head',set:'garden'},
  pet_shell_lei:{name:'珊瑚贝壳链',xp:45,cost:75,emoji:'🐚',kind:'outfit',level:3,art:'shell_lei',slot:'neck',set:'seaside'},
  pet_collar:{name:'金铃红丝绒圈',xp:44,cost:72,emoji:'🔔',kind:'outfit',level:3,art:'collar',slot:'neck',set:'cozy'},
  pet_rose:{name:'小王子玫瑰针',xp:46,cost:76,emoji:'🌹',kind:'outfit',level:3,art:'rose',slot:'body',anchor:'pin',set:'cozy'},
  pet_clover:{name:'四叶草微风',xp:48,cost:85,emoji:'🍀',kind:'outfit',level:3,art:'clover',slot:'companion',anchor:'ground',set:'garden'},

  pet_beret:{name:'栗子画家帽',xp:55,cost:90,emoji:'🎨',kind:'outfit',level:4,art:'beret',slot:'head',set:'artist'},
  pet_ears:{name:'焦糖小熊耳',xp:52,cost:88,emoji:'🧸',kind:'outfit',level:4,art:'ears',slot:'head',set:'cozy'},
  pet_sailor:{name:'海风小水手领',xp:56,cost:92,emoji:'⚓',kind:'outfit',level:4,art:'sailor',slot:'neck',set:'seaside'},
  pet_camera:{name:'复古胶片机',xp:58,cost:95,emoji:'📷',kind:'outfit',level:4,art:'camera',slot:'body',anchor:'chest',set:'artist'},
  pet_balloon:{name:'晴空云朵气球',xp:54,cost:90,emoji:'🎈',kind:'outfit',level:4,art:'balloon',slot:'companion',anchor:'float',set:'seaside'},

  pet_scholar:{name:'墨香小方帽',xp:65,cost:105,emoji:'🎓',kind:'outfit',level:5,art:'scholar',slot:'head',set:'scholar'},
  pet_straw:{name:'夏日麦秆帽',xp:62,cost:102,emoji:'👒',kind:'outfit',level:5,art:'straw',slot:'head',set:'seaside'},
  pet_ribbon:{name:'敦煌飞天帛',xp:70,cost:115,emoji:'🎗️',kind:'outfit',level:5,art:'ribbon',slot:'neck',layer:'under'},
  pet_satchel:{name:'邮差的小挎包',xp:65,cost:110,emoji:'💌',kind:'outfit',level:5,art:'satchel',slot:'body',anchor:'satchel',set:'wanderer'},
  pet_sunglass:{name:'假日琥珀墨镜',xp:64,cost:108,emoji:'🕶️',kind:'outfit',level:5,art:'sunglass',slot:'body',anchor:'face',set:'seaside'},

  pet_crown:{name:'月桂小王冠',xp:80,cost:140,emoji:'👑',kind:'outfit',level:6,art:'crown',slot:'head'},
  pet_pearls:{name:'月光珍珠链',xp:76,cost:130,emoji:'🫧',kind:'outfit',level:6,art:'pearls',slot:'neck',set:'cozy'},
  pet_guitar:{name:'原木尤克里里',xp:78,cost:132,emoji:'🎸',kind:'outfit',level:6,art:'guitar',slot:'body',anchor:'chest',set:'artist'},
  pet_firefly:{name:'夏夜萤火灯',xp:78,cost:135,emoji:'✨',kind:'outfit',level:6,art:'firefly',slot:'companion',anchor:'float',set:'scholar'},
  pet_cat:{name:'打盹小橘猫',xp:82,cost:142,emoji:'🐱',kind:'outfit',level:6,art:'cat',slot:'companion',anchor:'ground',set:'cozy'},

  pet_knit:{name:'安第斯绒球帽',xp:90,cost:160,emoji:'🧶',kind:'outfit',level:7,art:'knit',slot:'head',set:'wanderer'},
  pet_witch:{name:'观星小巫师帽',xp:88,cost:155,emoji:'🧙',kind:'outfit',level:7,art:'witch',slot:'head',set:'space'},
  pet_moon:{name:'晚安月亮胸针',xp:100,cost:180,emoji:'🌙',kind:'outfit',level:7,art:'moon',slot:'body',anchor:'pin'},

  pet_raincoat:{name:'雨后散步披风',xp:120,cost:220,emoji:'🌧️',kind:'outfit',level:8,art:'raincoat',slot:'neck',set:'rain'},
  pet_ducky:{name:'雨洼小黄鸭',xp:110,cost:190,emoji:'🐥',kind:'outfit',level:8,art:'ducky',slot:'companion',anchor:'ground',set:'rain'},
  pet_snowman:{name:'暖巾小雪团',xp:108,cost:185,emoji:'⛄',kind:'outfit',level:8,art:'snowman',slot:'companion',anchor:'ground',set:'cozy'},

  pet_helmet:{name:'星际泡泡盔',xp:135,cost:240,emoji:'🫧',kind:'outfit',level:9,art:'helmet',slot:'head',set:'space'},
  pet_wings:{name:'森灵透明蝶翼',xp:130,cost:230,emoji:'🦋',kind:'outfit',level:9,art:'wings',slot:'neck',layer:'under',set:'garden'},
  pet_space:{name:'星际探险披风',xp:150,cost:300,emoji:'🪐',kind:'outfit',level:10,art:'space_cape',slot:'neck',layer:'under',set:'space'},
  pet_planet:{name:'环绕小土星',xp:145,cost:260,emoji:'💫',kind:'outfit',level:10,art:'planet',slot:'companion',anchor:'float',set:'space'}
};

export function normalizeEquipped(pet={}){
  const raw=pet.equipped&&typeof pet.equipped==='object'?pet.equipped:{};
  const out={head:'',neck:'',body:'',companion:''};
  for(const [slot] of OUTFIT_SLOTS){
    const eff=raw[slot];
    if(eff&&PET_ITEMS[eff]?.kind==='outfit'&&PET_ITEMS[eff].slot===slot&&!petItemLock(pet,eff))out[slot]=eff;
  }
  if(!Object.values(out).some(Boolean)&&pet.outfit&&PET_ITEMS[pet.outfit]?.kind==='outfit'&&!petItemLock(pet,pet.outfit)){
    const s=PET_ITEMS[pet.outfit].slot||'neck';
    if(Object.hasOwn(out,s))out[s]=pet.outfit;
  }
  return out;
}

export function activePetSets(equipped={}){
  const worn=new Set(Object.values(equipped).filter(Boolean));
  return Object.entries(PET_SETS).filter(([,s])=>s.items.filter(i=>worn.has(i)).length>=s.min).map(([id,s])=>({id,...s}));
}

export function petItemLock(pet,effect){
  const item=PET_ITEMS[effect];if(!item)return '';
  if(item.ready===false)return '未解锁 · 正在准备';
  if(!pet?.owned)return '未解锁 · 先遇见宠物';
  return pet.level<item.level?'未解锁 · Lv.'+item.level:'';
}

export function petEffectLabel(effect){
  const p=PET_ITEMS[effect];
  if(!p)return effect==='pet_companion'?'小伙伴 / 重复 +60 经验':'';
  const slotName=p.kind==='outfit'?OUTFIT_SLOTS.find(([k])=>k===p.slot)?.[1]||'装扮':'';
  return (p.kind==='gear'?'行囊 · 旅行':p.kind==='food'?(p.specialty?p.specialty+' ·':'口粮 ·'):slotName+' · 首次')+' +'+p.xp+' 经验';
}
