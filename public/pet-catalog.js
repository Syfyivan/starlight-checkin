// One catalog for purchase rules, the wardrobe and illustrations.
export const PET_ITEMS={
 pet_pack:{name:'轻巧远行袋',xp:15,cost:20,emoji:'🎒',kind:'gear',level:1,art:'pack'},
 pet_tent:{name:'星光露营包',xp:40,cost:60,emoji:'⛺',kind:'gear',level:1,art:'tent'},
 pet_snack:{name:'一口云朵粮',xp:5,cost:10,emoji:'🥣',kind:'food',level:1,art:'bowl'},
 pet_feast:{name:'元气野餐盒',xp:20,cost:30,emoji:'🧺',kind:'food',level:1,art:'picnic'},
 pet_bow:{name:'莓莓蝴蝶结',xp:30,cost:50,emoji:'🎀',kind:'outfit',level:1,art:'bow',slot:'neck'},
 pet_star:{name:'星星小徽章',xp:50,cost:80,emoji:'⭐',kind:'outfit',level:1,art:'star',slot:'chest'},
 pet_berry:{name:'莓果小点心',xp:12,cost:20,emoji:'🫐',kind:'food',level:2,art:'berry'},
 pet_soup:{name:'暖呼呼蘑菇汤',xp:28,cost:45,emoji:'🍲',kind:'food',level:4,art:'soup'},
 pet_bento:{name:'森林便当盒',xp:45,cost:70,emoji:'🍱',kind:'food',level:6,art:'bento'},
 pet_map:{name:'风的旅行手账',xp:25,cost:35,emoji:'🗺️',kind:'gear',level:3,art:'map'},
 pet_lantern:{name:'月光小提灯',xp:60,cost:85,emoji:'🏮',kind:'gear',level:5,art:'lantern'},
 pet_scarf:{name:'奶油格子围巾',xp:35,cost:60,emoji:'🧣',kind:'outfit',level:2,art:'scarf',slot:'neck'},
 pet_flower:{name:'雏菊悄悄开',xp:40,cost:65,emoji:'🌼',kind:'outfit',level:3,art:'flower',slot:'head'},
 pet_beret:{name:'栗子画家帽',xp:55,cost:90,emoji:'🎨',kind:'outfit',level:4,art:'beret',slot:'head'},
 pet_satchel:{name:'邮差的小挎包',xp:65,cost:110,emoji:'💌',kind:'outfit',level:5,art:'satchel',slot:'chest'},
 pet_crown:{name:'月桂小王冠',xp:80,cost:140,emoji:'👑',kind:'outfit',level:6,art:'crown',slot:'head'},
 pet_moon:{name:'晚安月亮胸针',xp:100,cost:180,emoji:'🌙',kind:'outfit',level:7,art:'moon',slot:'chest'},
 pet_raincoat:{name:'雨后散步套装',xp:120,cost:220,emoji:'🌧️',kind:'outfit',level:8,art:'coat',ready:false},
 pet_space:{name:'星际探险套装',xp:150,cost:300,emoji:'🪐',kind:'outfit',level:10,art:'coat',ready:false}
};
export function petItemLock(pet,effect){const item=PET_ITEMS[effect];if(!item)return '';if(item.ready===false)return '未解锁 · 正在准备';if(!pet.owned)return '未解锁 · 先遇见宠物';return pet.level<item.level?'未解锁 · Lv.'+item.level:'';}
export function petEffectLabel(effect){const p=PET_ITEMS[effect];return p?(p.kind==='gear'?'行囊 · 旅行':p.kind==='food'?'口粮 ·':'装扮 · 首次')+' +'+p.xp+' 经验':effect==='pet_companion'?'小伙伴 / 重复 +60 经验':'';}
