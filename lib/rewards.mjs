export const CATEGORIES=[
  {id:'study',name:'学习充电',emoji:'🤖',tone:'mint',rate:5},
  {id:'sport',name:'运动元气',emoji:'🏃',tone:'sky',rate:8},
  {id:'healthy',name:'健康饮食',emoji:'🍎',tone:'mint',rate:9},
  {id:'essentials',name:'衣鞋包包',emoji:'🧥',tone:'peach',rate:10},
  {id:'beauty',name:'闪闪香香',emoji:'💍',tone:'lilac',rate:15},
  {id:'food',name:'零食饮料',emoji:'🧋',tone:'yellow',rate:20},
  {id:'play',name:'游戏玩具',emoji:'🎮',tone:'sky',rate:20},
  {id:'universal',name:'万能心愿',emoji:'🌈',tone:'rainbow',rate:20},
  {id:'custom',name:'特别约定',emoji:'🎁',tone:'mint',rate:10}
];
export const DEFAULT_RATES=Object.fromEntries(CATEGORIES.map(c=>[c.id,c.rate]));
export const TEMPLATES=[
  ['study','灵感充电卡','给 AI Coding Plan、API 调用或学习工具充一点电。',20,'小小补给','🤖'],
  ['study','代码起飞卡','AI 编程订阅、API 额度或课程书籍，凭充值或购买记录报销。',100,'进阶心愿','🚀'],
  ['study','学习超能力卡','认真学习的大补给，支持订阅、API 额度和学习用品。',300,'闪闪大愿','✨'],
  ['sport','动一动卡','运动小装备、运动用品，给身体一点支持。',20,'小小补给','🏸'],
  ['sport','元气满格卡','喜欢的运动产品，凭购买记录报销。',100,'进阶心愿','👟'],
  ['sport','运动小冠军卡','一份更大的运动装备心愿。',300,'闪闪大愿','🏅'],
  ['essentials','穿搭小补丁卡','衣服、鞋子、包包的日常小心愿。',30,'小小补给','🧦'],
  ['essentials','今天穿好看卡','挑一件合适的衣鞋包，凭购买记录报销。',100,'进阶心愿','🧥'],
  ['essentials','衣橱焕新卡','给衣橱添一份认真挑选的必需品。',300,'闪闪大愿','👜'],
  ['beauty','一点点香香卡','首饰或香水的小补贴。',30,'小小补给','🌷'],
  ['beauty','闪闪发光卡','首饰、香水，让喜欢的自己闪闪发光。',100,'进阶心愿','💍'],
  ['beauty','香香小仙女卡','收藏一份首饰或香水心愿。',300,'闪闪大愿','🧚'],
  ['food','奶茶一杯卡','给认真生活的你一杯快乐，凭消费记录报销。',20,'小小补给','🧋'],
  ['food','小吃一顿卡','吃一点喜欢的，把快乐装进肚子里。',50,'进阶心愿','🍟'],
  ['food','大吃一顿卡','好好吃一顿！凭这次吃喝的消费记录报销。',150,'闪闪大愿','🍲'],
  ['universal','随心小云朵卡','可按等额人民币转换成任意品类卡，也可凭记录直接申请报销。',20,'小小补给','☁️'],
  ['universal','愿望都灵卡','不限品类的心愿额度，按人民币面额 1:1 转换。',100,'进阶心愿','🌈'],
  ['study','灵感小火苗卡','AI 工具或 API 充值的小补贴，一点努力也能点亮灵感。',5,'每日小甜头','🕯️'],
  ['study','代码小饼干卡','给 AI Coding Plan、API 或学习用品添一点能量。',10,'轻轻一小步','🍪'],
  ['study','脑袋开花卡','订阅、书籍、课程或 API 充值，凭记录报销。',50,'攒攒小心愿','🌼'],
  ['sport','动动小脚丫卡','运动小物或运动用品的一点小补贴。',5,'每日小甜头','🐾'],
  ['sport','元气小弹簧卡','给运动装备添一点预算，凭购买记录报销。',10,'轻轻一小步','🪀'],
  ['sport','活力蹦蹦卡','为喜欢的运动，准备一份合适的小装备。',50,'攒攒小心愿','🏀'],
  ['essentials','袜袜暖呼呼卡','衣服、鞋子、包包的日常小补贴。',5,'每日小甜头','🧦'],
  ['essentials','衣橱小纽扣卡','添一件小小必需品，也可以合成更大的穿搭心愿。',10,'轻轻一小步','🧵'],
  ['essentials','出门美滋滋卡','衣鞋包的购买额度，凭消费记录报销。',50,'攒攒小心愿','👒'],
  ['beauty','香香小花苞卡','首饰或香水的一点小补贴，也能慢慢合成大心愿。',5,'每日小甜头','🌸'],
  ['beauty','闪闪小星屑卡','把首饰或香水的小愿望一点点攒起来。',10,'轻轻一小步','💫'],
  ['beauty','香气抱抱卡','给首饰和香水留一份专属预算。',50,'攒攒小心愿','🪻'],
  ['food','糖糖一颗卡','吃喝的小小补贴，一点甜也值得开心。',2,'随手小快乐','🍬'],
  ['food','快乐加料卡','给喜欢的小吃或饮料加一点快乐，凭消费记录报销。',5,'每日小甜头','🧋'],
  ['food','小嘴乐呵呵卡','一份小吃、一杯饮料，或者合成下一顿大餐。',10,'轻轻一小步','🥨'],
  ['food','小肚子圆圆卡','吃一份喜欢的，把这一小天过得有滋有味。',30,'攒攒小心愿','🥟'],
  ['universal','随心棉花糖卡','按人民币额度 1:1 换任意品类，也可凭记录直接报销。',5,'每日小甜头','🍡'],
  ['universal','心愿小彩虹卡','学习、运动或生活心愿，等额转换成你喜欢的卡。',50,'攒攒小心愿','🌦️']
].map(([category,title,description,yuan,tier,emoji],index)=>({template_id:`wish-${index+1}`,category,title,description,face_cents:yuan*100,tier,emoji,tone:CATEGORIES.find(c=>c.id===category).tone,stock:3,weight:Math.max(1,Math.round((yuan<=10?20:yuan<=30?8:yuan<=100?3:1)*(category==='universal'?.4:1))),wait_days:0,active:true}));

TEMPLATES.push({template_id:'room-rename',category:'custom',effect:'room_rename',title:'小屋改名卡',description:'给小屋挂一块新招牌，使用后生效 7 天，到期恢复原名。放在卡包里不计时。',face_cents:0,cost:20,tier:'新招牌',emoji:'🏡',tone:'sky',stock:3,weight:5,wait_days:0,active:true});

for(const [template_id,category,title,yuan,emoji,description] of [
  ['healthy-5','healthy','苹果咔嚓卡',5,'🍎','水果、牛奶等日常食品的小额补贴。'],
  ['healthy-10','healthy','早餐好好吃卡',10,'🥚','一份早餐，或补充水果、牛奶。'],
  ['healthy-20','healthy','认真吃饭卡',20,'🥗','为日常正餐、蔬菜和水果留一份预算。'],
  ['healthy-50','healthy','冰箱补给卡',50,'🥑','采购日常食材，适用范围由发奖人约定。'],
  ['play-5','play','快乐小零件卡',5,'🧩','拼图、积木或小玩具的补贴。'],
  ['play-10','play','玩一小会卡',10,'🎲','游戏、桌游或玩具，选一份喜欢的。'],
  ['play-30','play','快乐存档卡',30,'🎮','给想玩的游戏或玩具添一点预算。'],
  ['play-100','play','周末开玩卡',100,'🕹️','一款游戏、一套积木或其他玩具，凭购买记录报销。']
]){const c=CATEGORIES.find(c=>c.id===category);TEMPLATES.push({template_id,category,title,description,face_cents:yuan*100,tier:yuan<=10?'日常奖励':'进阶奖励',emoji,tone:c.tone,stock:3,weight:yuan<=10?20:5,wait_days:0,active:true});}
