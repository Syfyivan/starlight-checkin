import {WORLD_STOPS} from './world-stops.js';

// Original activities based on the UNESCO references saved with each postcard.
// These are optional learning prompts; reading or answering never awards coins.
export const TRAVEL_NOTES={
 'mogao':{theme:'culture',stamp:'石窟里的颜色',fact:'敦煌莫高窟地处丝绸之路沿线，洞窟中保存着壁画和雕塑。',question:'在莫高窟可以看到哪两种艺术作品？',choices:['壁画和雕塑','冰雕和沙雕','剪纸和刺绣'],answer:0,practice:'选一件小物，试着用画和捏两种方式表现它',minutes:15,midway:'我沿着崖壁数洞口，数到一半，被本子上画歪的一条飘带逗笑了。等我回来给你看。'},
 'terracotta-army':{theme:'culture',stamp:'陶俑的眉眼',fact:'秦始皇陵的兵马俑用陶土制成，人物的面貌和细节各有不同。',question:'仔细观察兵马俑，能发现什么？',choices:['每张脸都完全相同','不同陶俑的细节有差别','每个都骑着马'],answer:1,practice:'用相同的轮廓画三张脸，每张只改两个细节',minutes:10,midway:'今天在速写本上试了三种眉毛。同一张圆脸，换一对眉毛，神情就变啦。'},
 'jiuzhaigou':{theme:'nature',stamp:'湖边的水声',fact:'九寨沟的山林间分布着湖泊、瀑布和石灰岩阶地。',question:'哪一组景观可以在九寨沟看到？',choices:['沙丘和盐壳','火山和熔岩','湖泊和瀑布'],answer:2,practice:'画出平静和流动的水，各给它配一个声音',minutes:10,midway:'今天记了两种声音：溪水淌过去的轻响，和瀑布落下的哗啦声。猜猜哪种被我写得更大？'},
 'grand-canyon':{theme:'nature',stamp:'峡谷的岩层',fact:'科罗拉多河切开岩层，形成了美国亚利桑那州的大峡谷。',question:'哪条河塑造了这座大峡谷？',choices:['科罗拉多河','多瑙河','黄河'],answer:0,practice:'用不同颜色的纸叠出岩层，画一条穿过它们的河',minutes:15,midway:'峡谷的岩壁是一层一层的。我在每一层旁边点了不同颜色，免得回家画乱顺序。'},
 'great-wall':{theme:'culture',stamp:'山脊上的城墙',fact:'长城由不同时期的城墙逐渐连接、修筑而成，建设延续到明代。',question:'长城是怎样慢慢形成的？',choices:['一天建完','不同时期逐渐修建','只是一座城门'],answer:1,practice:'查一查长城的修建过程，画一条小时间线',minutes:15,midway:'我沿着山脊慢慢走，远处的城墙像一条弯弯的线。带来的行囊很安心，等回家给你看我的小画。'},
 'fujian-tulou':{theme:'culture',stamp:'围坐的小院',fact:'福建土楼有圆形，也有方形；许多家庭围着中央院落生活。',question:'土楼的平面形状有什么特点？',choices:['只有三角形','只有圆形','有圆形，也有方形'],answer:2,practice:'画一个有中央院子的家，标出大家共享的地方',minutes:15,midway:'今天钻进了一个热闹的小院，转了一圈，差点绕回刚才的门。留了一个关于房子的小发现，回家告诉你。'},
 'lijiang':{theme:'culture',stamp:'流水小巷',fact:'丽江古城拥有古老的供水系统，建筑也融合了多种文化的特点。',question:'丽江古城的小巷里，有什么值得留意？',choices:['古老的供水系统','海底隧道','冰川洞穴'],answer:0,practice:'观察家附近的水流，画出它经过的路线',minutes:10,midway:'沿着小巷听了一会儿流水，水拐了弯，我也拐了弯。今天想慢一点走，把细小的声音装进信里。'},
 'kyoto':{theme:'culture',stamp:'庭园的一角',fact:'京都建城于公元 794 年，木结构建筑和庭园艺术是它的重要文化特色。',question:'京都的重要文化特色包括什么？',choices:['木结构建筑与庭园','极地冰屋','沙漠岩画'],answer:0,practice:'看看一座庭园的照片，画出树、石头与小路的位置',minutes:15,midway:'在庭园边坐了一小会儿，看树影慢慢挪动。旅途不用每一刻都赶路，你做完小计划，也记得歇一歇。'},
 'taj-mahal':{theme:'culture',stamp:'云白色的屋顶',fact:'位于阿格拉的泰姬陵是一座以白色大理石建成的陵墓。',question:'泰姬陵最有代表性的建筑材料是什么？',choices:['冰块','白色大理石','竹子'],answer:1,practice:'找一张泰姬陵的照片，观察左右对称的地方',minutes:10,midway:'远远看见一座云朵颜色的建筑。我在纸上画了一半，另一半想试着画得对称，回家一起看看吧。'},
 'quirigua':{theme:'culture',stamp:'石头上的故事',fact:'基里瓜遗址保留了玛雅人的雕刻石碑和石刻历法，是研究玛雅文明的资料。',question:'基里瓜的石碑帮助人们了解哪种文明？',choices:['玛雅文明','古埃及文明','古希腊文明'],answer:0,practice:'查一个玛雅文明的小知识，用三句话写给未来的自己',minutes:15,midway:'今天遇见了刻着图案的石碑，原来石头也能保存很久以前的故事。我先记下一个新词，回来和你分享。'},
 'niokolo-koba':{theme:'nature',stamp:'河岸观察员',fact:'尼奥科罗-科巴国家公园沿冈比亚河分布着河岸森林和稀树草原，有多种野生动物。',question:'这个国家公园沿着哪条河流分布？',choices:['尼罗河','亚马孙河','冈比亚河'],answer:2,practice:'认识一种稀树草原动物，记下它的生活环境',minutes:15,midway:'我把脚步放轻，在远处观察河边的动物。不打扰它们，就是今天学到的旅行礼貌。你那边的小计划进行得怎样啦？'},
 'los-glaciares':{theme:'nature',stamp:'蓝冰的小碎片',fact:'阿根廷的冰川国家公园有高山、冰川和冰川湖，冰块可以从冰川边缘落入湖中。',question:'冰川边缘落下的冰块可能去哪里？',choices:['飞向月球','进入湖中','变成火山'],answer:1,practice:'查一查冰川怎样形成，用图画解释给一个朋友',minutes:15,midway:'湖面上有蓝白色的冰，我在本子里涂了好多浅蓝。原来有些变化很慢，却能留下很大的痕迹，就像一点点积累的努力。'}
};
export const TRAVEL_ROUTES=[['auto','让行囊带路'],['culture','逛逛人文小巷'],['nature','看看山野自然']];
export const GEAR_ROUTES={pet_tent:'nature',pet_lantern:'culture',pet_map:'culture'};
export const ROUTE_NAMES={surprise:'随心漫游',culture:'人文小巷',nature:'山野自然'};
export function routeFor(choice,effects=[]){return choice==='auto'?(effects.map(e=>GEAR_ROUTES[e]).find(Boolean)||'surprise'):choice||'surprise';}
export function packingHint(choice,effects=[]){const route=routeFor(choice,effects);return (route==='surprise'?'这一趟随心走走':`这一趟偏向${ROUTE_NAMES[route]}`)+'。先去新地点，这条路线走完就换一条；全部走过后，优先重游去得少的地方。';}
// Each object is an imaginary souvenir made or collected by the travelling pet.
export const KEEPSAKES={
 'mogao':{clue:'我画了一条能在纸上飞舞的飘带，折起来放进信封了。',items:['飘带画片','小石碗','松果印章'],answer:0},
 'terracotta-army':{clue:'我用铅笔给陶俑画了三副眉眼，装订成一本巴掌大的册子。',items:['铜色纸铃','陶俑速写册','河流拼图'],answer:1},
 'jiuzhaigou':{clue:'我把蓝纸剪成细条，贴在湖面上方，纸梢垂下来像水在流。',items:['山谷风筝','年轮拓片','纸瀑布'],answer:2},
 'grand-canyon':{clue:'我把几张土黄色和红色的纸叠好，剪了一道弯口，露出一层一层的边。',items:['岩层剪纸','稻草小帽','湖面书签'],answer:0},
 'great-wall':{clue:'我把山脊上一高一低的城墙画在纸条上，想夹进你正在读的书。',items:['山脊书签','雨滴玻璃珠','蓝格手帕'],answer:0},
 'fujian-tulou':{clue:'我用牛皮纸折了一圈房屋，正中间留了个小小的院子。',items:['木头风车','圆院纸模型','月牙饼干'],answer:1},
 'lijiang':{clue:'我沿着小巷画了一路，蓝线是流水，弯弯的线交会处画着一座桥。',items:['花纹纽扣','竹叶信封','水巷手绘图'],answer:2},
 'kyoto':{clue:'我把庭园里最喜欢的树影画在扇面上，一打开就能扇起小风。',items:['庭园纸扇','绒线帽','小木勺'],answer:0},
 'taj-mahal':{clue:'我对着白色建筑画了一半，把纸一折，左右两边就碰面了。',items:['贝壳哨','对折建筑画','花布袋'],answer:1},
 'quirigua':{clue:'我把看过的石碑轮廓画在小本上，铅笔灰还沾在爪尖。',items:['晴天风铃','圆叶杯垫','石碑速写'],answer:2},
 'niokolo-koba':{clue:'我躲在远处观察，把河边看到的小小脚印描在方格纸上。',items:['足迹观察卡','白云橡皮','纸折小船'],answer:0},
 'los-glaciares':{clue:'真的冰会融化，所以我用蓝色透明纸叠出了冰川的棱角。',items:['晒干的花瓣','蓝冰折纸','小铜铃'],answer:1}
};

for(const [index,stop] of WORLD_STOPS.entries()){
  const answer=index%3,choices=[...stop.distractors];
  choices.splice(answer,0,stop.answer);
  TRAVEL_NOTES[stop.id]={theme:stop.theme,stamp:stop.era,fact:stop.fact,question:stop.question,choices,answer,
    practice:stop.practice,minutes:10,midway:stop.letter.split(/[。！？]/u)[0]+'。'};
  const items=[WORLD_STOPS[(index+1)%WORLD_STOPS.length].keepsake,WORLD_STOPS[(index+2)%WORLD_STOPS.length].keepsake];
  items.splice(answer,0,stop.keepsake);
  KEEPSAKES[stop.id]={clue:stop.letter,items,answer};
}
