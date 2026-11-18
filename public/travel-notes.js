import {WORLD_STOPS} from './world-stops.js';

// Original activities, non-spoiler riddles, themed stamp routes, packing synergies and midway fork choices.
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
export const GEAR_ROUTES={pet_tent:'nature',pet_lantern:'culture',pet_map:'culture',pet_sketchbook:'culture',pet_compass:'nature'};
export const ROUTE_NAMES={surprise:'随心漫游',culture:'人文小巷',nature:'山野自然'};
export function routeFor(choice,effects=[]){return choice==='auto'?(effects.map(e=>GEAR_ROUTES[e]).find(Boolean)||'surprise'):choice||'surprise';}

export function packingCombos(effects=[]){
 const set=new Set(effects);
 const combos=[];
 if(set.has('pet_sketchbook')||set.has('pet_map'))combos.push({id:'sketch',badge:'🎨 写生速写',desc:'明信片加盖手绘印记'});
 if(set.has('pet_tent')||set.has('pet_lantern')||set.has('pet_compass'))combos.push({id:'sky',badge:'✨ 追光观星',desc:'更容易邂逅晨霞与星夜时辰'});
 if(set.has('pet_feast')||set.has('pet_bento')||set.has('pet_soup'))combos.push({id:'friend',badge:'🐾 分享野餐',desc:'更容易在旅途中偶遇当地小动物同框'});
 return combos;
}

export function packingHint(choice,effects=[]){
 const route=routeFor(choice,effects),combos=packingCombos(effects);
 const base=(route==='surprise'?'这一趟随心走走':`这一趟偏向${ROUTE_NAMES[route]}`)+'。先去新地点，这条路线走完就换一条；全部走过后，优先重游去得少的地方。';
 return combos.length?base+' 已触发：'+combos.map(c=>c.badge).join('、')+'。':base;
}

// Handcrafted non-spoiler riddles for all 36 world stops (replaces verbatim letter copy!).
const WORLD_RIDDLES={
 'rome':['我在街角的拱门下停了停，把古广场与后来的尖顶分画在左右两页。','我把一张厚卡对折成两面，一面记共和时期的柱子，一面记后来的钟楼，同一条街刚好穿过折缝。'],
 'athens':['爬上山坡时风吹乱了画纸，我数着白色的石柱慢慢喘气。','我用硬纸折出了一排立柱和柱间透出的蓝天，一拉就能立在桌面上。'],
 'alhambra':['山丘上的花园一直在响着细细的水声，我顺着水渠走了一路。','我用青蓝铅笔在一张小方纸上描出宫苑池水流向花园的路线。'],
 'venice':['船桨轻轻拨开水面，两排房子的倒影晃成了彩色的波浪。','我剪了一张浅蓝色的小票根，上面印着水巷与尖头小船的记号。'],
 'stonehenge':['站在旷野的大石头旁，我一边数石块，一边抬头看太阳的方向。','我在圆圆的灰卡纸边缘画了一圈立石，中间留着待解的小问号。'],
 'bruges':['运河边的尖顶房子像排好的积木，画室窗台飘来颜料的味道。','我把今天见到的砖红、运河蓝和麦穗黄涂成了一条长长的试色纸。'],
 'krakow':['大广场上的鸽子飞起来时，我正忙着给卖布的摊位画遮阳棚。','我在巴掌大的纸上标出了广场中央和四面八方汇拢来的商路箭头。'],
 'dubrovnik':['海风吹过白色的城墙，老喷泉边有海鸥停下来歇脚。','我做了一枚双色书签，蓝色记海船，赭色记震后重修的石墙年份。'],
 'angkor':['树影与水池把石塔映成了双份，我在两座寺之间走了好久。','我剪了一枚分岔的小纸牌，一头指向护城河大寺，一头指向微笑石塔城。'],
 'borobudur':['顺着台阶一圈圈往上走，脚下的平台不知不觉从方变成了圆。','我把几张方纸片和圆纸片从大到小叠在一起，做成了一座掌心小塔。'],
 'himeji':['远远看见白鹭一样的屋顶，走近却在弯弯曲曲的坡道里绕了好几圈。','我在白卡纸上用虚线描出了那条绕了好几个弯才通往主楼的防卫小路。'],
 'petra':['穿过狭窄的峡谷裂缝，迎面突然亮起一整面玫瑰色的岩壁宫门。','我用软纸轻轻拓下石壁与雕刻立柱交界处的折角轮廓。'],
 'persepolis':['宽阔的石砌高台托着高高的柱子，站在台阶边觉得自己好小呀。','我用深浅两种土黄色画了一张横切图，标出哪里是天然山岩、哪里是人工砌台。'],
 'samarkand':['白天的蓝色圆顶在发光，到了晚上我又去天文台旧址数星星。','我装订了两页迷你小册，黄页记街市，深蓝页点满了观测过的星辰。'],
 'gyeongju':['青草坡和石塔安安静静地站在一起，我退后几步看整体，又凑近看花纹。','我写了两张小小说明卡，一张配石塔轮廓，一张配近处的浮雕花纹。'],
 'ayutthaya':['河水绕着红砖老城，我对着高塔和地基猜想它从前热闹的模样。','我折了一张竖长条卡片，按年份写下建城、繁盛和留下遗迹的三段时光。'],
 'giza':['沙漠的风把细沙吹过石块，原来大三角旁边还守着好几座附属建筑。','我在牛皮纸上摆出大三角和周围祭庙、墓室的俯视位置。'],
 'lalibela':['这里的工匠不是往上垒石头，而是从整块红岩里一点点往下雕出屋顶！','我切下一片红泥色的纸板，把中间镂空成十字屋顶的俯视形状。'],
 'kilwa':['海浪拍着古港珊瑚石墙，我在海图上连起遥远海岸飘来的瓷片线索。','我画了一张带着帆影与碎瓷花纹的跨海路线小图。'],
 'timbuktu':['黄沙边缘的土筑学堂里格外阴凉，我想象着从前学生抄书的沙沙声。','我裁了一枚像旧书签一样的纸条，上面画着一盏小油灯和摊开的书卷。'],
 'zimbabwe':['高高的花岗岩石墙顺着地势弯出优美的弧度，一块灰浆也没有用。','我顺着石墙的弯曲剪了一把弧形纸尺，刚好能量出内陆古城的圆弧。'],
 'ngorongoro':['站在火山口高处往下望，草原、水泡子和远远走过的牧群都在同一幅画里。','我在浅绿卡纸上并排印下了野生动物蹄印和牧人草鞋的小脚印。'],
 'machupicchu':['云雾从山脊漫过来，一级级绿梯田像给陡峭大山缝好的衣褶。','我把绿卡纸反复正反折叠，拉出了一层层顺着山势往上的小台阶。'],
 'chichenitza':['阶梯金字塔四面都有长长的石阶，石雕上藏着不同地方传来的花纹。','我把两种不同风格的石雕纹样并排描在同一张比对小卡上。'],
 'mesaverde':['抬头看陡峭的砂岩崖壁，凹进去的避风石龛里竟然藏着整排石屋。','我画了一张上下两层的山崖立面卡，上层是台顶田地，下层是岩洞石屋。'],
 'cartagena':['加勒比海的暖风吹过老城墙，港口和彩色阳台之间有好多条小巷。','我折了一张一半画海湾帆影、一半画老城街巷的港口折页。'],
 'rapanui':['太平洋的浪花拍着岸边石台，高大的摩艾石像背朝大海静静站立。','我用深灰卡纸剪出了巨石像连同脚下石台一起站立的侧影。'],
 'iguazu':['还没看见瀑布，轰隆隆的水声和细密水雾已经把我的胡须打湿啦！','我在防水蜡纸上用长短不一的蓝白线条记下了瀑布跌落的节奏。'],
 'galapagos':['两座火山岛隔海相望，岸边晒太阳的大海龟慢吞吞地眨了眨眼。','我画了一张分栏小表格，专门记录不同小岛上动物嘴巴与背甲的细微差别。'],
 'banff':['冰川融水把山间湖泊染成翡翠色，没想到山顶页岩里还藏着古海洋生物印痕！','我给山间找到的远古海洋印痕画了一枚带编号的博物馆小标签。'],
 'reef':['透过清澈的海水往下看，鹿角一样的珊瑚丛里有海龟轻轻游过去。','我把一张蓝卡纸折出四个小取景窗，每扇窗里都画了珊瑚礁里的邻居。'],
 'kakadu':['赭红色的岩石长廊避开了日晒，古老的岩画还留着当地先民讲述的故事。','我在红褐色纸签旁留出空白栏，记下岩画图案和想向当地人请教的问题。'],
 'nanmadol':['人工垒起的玄武岩小岛浮在浅海潟湖里，出门串门都得划小船穿过水道。','我用深灰小纸块贴在蓝纸上，拼出了水道纵横的人工岛群图。'],
 'tongariro':['云朵绕着火山锥转圈，山脚的向导轻声讲起毛利人与群山世代相伴的传说。','我做了一枚正反两面的山形签，正面画火山地貌，背面记文化故事。'],
 'dujiangyan':['江心的分水鱼嘴把奔腾的岷江一分为二，内江的水稳稳流向了远处的稻田。','我用深浅两条蓝线画出了江水分流、引向平原农田的路线图。'],
 'liangzhu':['在古老城址外围的水坝边，一粒小小的稻谷串起了五千年前的水乡生活。','我画了一张把外围高坝低坝、河道与金色稻田连在一起的小图。'],
 'huanglong':['山谷里的水池一层叠着一层，阳光照过来时每格水池都换了不同的蓝绿色。','我把薄荷绿、湖水蓝和浅鹅黄依次涂成一排圆弧，做成了一张山谷水色比对卡。'],
 'wuyishan':['坐上竹筏转过赤红色的山崖，九道弯里的水波声和岸边茶香一起飘了过来。','我在淡青色长纸签上描出弯弯曲曲的溪流波纹，反面压了一缕山间茶香。'],
 'shirakawago':['山谷里的木屋全都顶着像合起手掌一样的厚茅草大屋顶，一点也不怕冬天的雪。','我用厚牛皮纸对折出一座陡坡屋顶的小房子，轻轻一立就能稳稳站住。'],
 'yakushima':['古老的大杉树高得望不到顶，连树根和圆石头上都盖着软绵绵的绿苔藓。','我在深绿绒纸上点了一颗亮晶晶的透明水珠，记下千年森林清晨的湿润气息。'],
 'halong':['平静的海湾里长出了好多座青绿色的石灰岩小山峰，船影就在山影之间穿行。','我用浓淡三层青墨色剪出远近交叠的海上孤峰小书签。'],
 'cappadocia':['浅杏色的山谷里立着戴小石帽的奇特岩柱，岩壁上的小窗格像童话里的阁楼。','我画了一张戴着深色石帽的圆锥岩柱小卡，标出顶石替下方遮风挡雨的秘密。'],
 'geirangerfjord':['两边的陡峭山壁直直插进深蓝海湾，好几条银白瀑布从高处挂下来。','我做了一把竖长条纸尺，一侧画陡壁瀑布，一侧量海湾到山顶有多高。'],
 'vatnajokull':['脚下是黑色的火山砂，抬头却是蓝白冰原，夜里天边还飘起淡绿色的极光带！','我在深黑底卡上贴了一小片冰蓝折纸和一抹淡绿荧光丝带。'],
 'hallstatt':['安静的湖面像一面擦亮的大镜子，把木屋阳台、尖顶和远山全都映成了双份。','我把湖畔木屋画在纸张上半截，对折压印出下半截对称的水中倒影，旁边附了一粒透明盐晶图案。'],
 'kinderdijk':['沿着长长的堤坝水道走过去，十九座大风车的叶片正借着风力帮草地排水呢。','我用两片交叉的木纹纸条钉成一枚能轻轻拨动的四叶小风车书签。'],
 'bernina':['鲜红色的小火车顺着圆形石拱桥慢慢转了个大圈，一路从绿草坡爬到了雪山垭口！','我留好了一张印着圆弧石桥与红色车厢的登山铁道纪念小票。'],
 'krumlov':['弯成马蹄形的河水把一整片橙红屋顶抱在中间，高处的彩绘塔楼特别显眼。','我画了一幅被U形蓝丝带河湾环抱的红屋顶微缩俯视图。'],
 'socotra':['海岛山坡上的龙血树全都撑着圆圆的大绿伞，枝干像倒过来的珊瑚一样分叉！','我用绿卡纸和棕枝条剪出了一棵撑着半圆大伞冠的奇特大树剪影。'],
 'turkana':['浅浅的裂谷湖岸边聚满了单脚站立的火烈鸟，远远看去像一片会动的粉红晚霞。','我在浅蓝纸签边贴了一小片柔和的粉红羽毛状剪纸。'],
 'madagascar':['穿过古老雨林的大蕨叶，一只拖着黑白条纹长尾巴的狐猴正好奇地低头看我！','我在树叶绿卡片上画了一条一圈黑、一圈白的蓬松长尾巴观察图。'],
 'fiordland':['南半球的深蓝峡湾半山腰飘着洁白云带，雪峰脚下竟然长满了翠绿的树蕨。','我用半透明硫酸纸叠在山海画片上，做出了一推就能飘动的半山云雾笺。']
};

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
  const [midway,clue]=WORLD_RIDDLES[stop.id]||[stop.letter.split(/[。！？]/u)[0]+'。',stop.letter];
  TRAVEL_NOTES[stop.id]={theme:stop.theme,stamp:stop.era,fact:stop.fact,question:stop.question,choices,answer,
    practice:stop.practice,minutes:10,midway};
  const items=[WORLD_STOPS[(index+1)%WORLD_STOPS.length].keepsake,WORLD_STOPS[(index+2)%WORLD_STOPS.length].keepsake];
  items.splice(answer,0,stop.keepsake);
  KEEPSAKES[stop.id]={clue,items,answer};
}

export const THEMED_ROUTES=[
  {id:'east-gardens',name:'东亚古韵',badge:'🏯 营造印章',places:['great-wall','fujian-tulou','kyoto','himeji','gyeongju','shirakawago']},
  {id:'silk-road',name:'丝路星河',badge:'🐪 丝路印章',places:['mogao','terracotta-army','samarkand','persepolis','petra','cappadocia']},
  {id:'water-wisdom',name:'治水与水城',badge:'🌊 水脉印章',places:['dujiangyan','liangzhu','lijiang','venice','kinderdijk','nanmadol']},
  {id:'fairy-towns',name:'童话湖山与铁道',badge:'🚂 漫游印章',places:['hallstatt','bernina','krumlov','bruges','krakow']},
  {id:'polar-fjords',name:'极光冰原与峡湾',badge:'🌌 极境印章',places:['vatnajokull','geirangerfjord','los-glaciares','banff','fiordland']},
  {id:'misty-peaks',name:'云雾茶山与彩池',badge:'🍵 山岚印章',places:['huanglong','wuyishan','jiuzhaigou','yakushima','halong']},
  {id:'ancient-stone',name:'巨石与迷城',badge:'🪨 石语印章',places:['stonehenge','giza','lalibela','zimbabwe','rapanui']},
  {id:'maritime-trade',name:'海风商帆',badge:'⛵ 远航印章',places:['dubrovnik','kilwa','cartagena','athens','rome','alhambra']},
  {id:'americas-heights',name:'山林古国',badge:'⛰️ 云梯印章',places:['machupicchu','chichenitza','quirigua','mesaverde']},
  {id:'living-earth',name:'神奇物种秘境',badge:'🦩 生灵印章',places:['galapagos','reef','socotra','turkana','madagascar','ngorongoro','niokolo-koba','iguazu','kakadu','tongariro']}
];

export const PLACE_SPECIALTY={
  'kyoto':'pet_matcha','himeji':'pet_matcha','gyeongju':'pet_matcha','fujian-tulou':'pet_matcha','lijiang':'pet_matcha','liangzhu':'pet_matcha','dujiangyan':'pet_matcha','wuyishan':'pet_matcha','shirakawago':'pet_matcha','yakushima':'pet_matcha',
  'mogao':'pet_naan','terracotta-army':'pet_naan','great-wall':'pet_naan','samarkand':'pet_naan','persepolis':'pet_naan','petra':'pet_naan','taj-mahal':'pet_naan','timbuktu':'pet_naan','cappadocia':'pet_naan','socotra':'pet_naan',
  'machupicchu':'pet_cocoa','chichenitza':'pet_cocoa','quirigua':'pet_cocoa','mesaverde':'pet_cocoa','iguazu':'pet_cocoa','los-glaciares':'pet_cocoa','banff':'pet_cocoa','tongariro':'pet_cocoa','bernina':'pet_cocoa','hallstatt':'pet_cocoa','vatnajokull':'pet_cocoa','geirangerfjord':'pet_cocoa','huanglong':'pet_cocoa',
  'venice':'pet_gelato','rome':'pet_gelato','athens':'pet_gelato','alhambra':'pet_gelato','dubrovnik':'pet_gelato','cartagena':'pet_gelato','reef':'pet_gelato','galapagos':'pet_gelato','nanmadol':'pet_gelato','kilwa':'pet_gelato','halong':'pet_gelato','kinderdijk':'pet_gelato','krumlov':'pet_gelato','fiordland':'pet_gelato'
};

export const PLACE_CAMEO={
  'mogao':'fox','samarkand':'fox','petra':'fox','giza':'fox','timbuktu':'fox','cappadocia':'fox','vatnajokull':'fox','madagascar':'fox',
  'kyoto':'deer','himeji':'deer','jiuzhaigou':'deer','banff':'deer','great-wall':'deer','gyeongju':'deer','yakushima':'deer','huanglong':'deer','shirakawago':'deer','geirangerfjord':'deer',
  'venice':'dove','rome':'dove','athens':'dove','bruges':'dove','krakow':'dove','dubrovnik':'dove','alhambra':'dove','hallstatt':'dove','kinderdijk':'dove','krumlov':'dove','wuyishan':'dove','turkana':'dove',
  'machupicchu':'alpaca','los-glaciares':'alpaca','grand-canyon':'alpaca','quirigua':'alpaca','chichenitza':'alpaca','bernina':'alpaca',
  'galapagos':'turtle','reef':'turtle','nanmadol':'turtle','rapanui':'turtle','kilwa':'turtle','iguazu':'turtle','halong':'turtle','socotra':'turtle','fiordland':'turtle'
};

export const LETTER_STYLES=[
  {id:'sketch',badge:'🎨 写生手记',openings:{
    'nuonuo-seal':'我找了一块晒得暖乎乎的平石头趴好，把水彩盒在肚皮边摆开：',
    'cloud-fox':'我用蓬松尾巴扫干净木长椅上的落叶，翻开速写本记下第一笔颜色：',
    'pocket-glider':'我把削好的小铅笔从核桃兜里掏出来，眯着眼睛比了比远处的比例：',
    'moon-bunny':'我把长耳朵拢在脑后免得沾上颜料，蘸着清亮的水滴慢慢晕染：',
    'cottonpod-hermit':'我从软绵绵的棉壳里探出半个身子，用小圆螯稳稳夹住画笔：',
    'moss-dragon':'我把随身书卷压在画纸一角防风，嫩芽角随着笔尖一晃一晃：'
  }},
  {id:'diary',badge:'📖 博物观察志',openings:{
    'nuonuo-seal':'今天我没有急着赶路，而是像数星星一样慢吞吞地观察起四周的细节：',
    'cloud-fox':'顺着风吹来的方向走了半里路，我的小耳朵捕捉到了好多有趣的线索：',
    'pocket-glider':'今天我的收集小兜差点装满问题！每走几步就想蹲下来看个究竟：',
    'moon-bunny':'空气里有淡淡的泥土与阳光气息，我踮起脚尖认真读完了路边的说明牌：',
    'cottonpod-hermit':'我最喜欢研究不同地方的“屋顶与外壳”啦，今天又有新发现：',
    'moss-dragon':'翻开我的小博物笔记第十二页，今天亲眼见到的景象比书上还要生动：'
  }},
  {id:'encounter',badge:'🐾 旅途偶遇记',openings:{
    'nuonuo-seal':'刚走过拐角我就停住了——今天的路上有温柔的小邂逅在等我：',
    'cloud-fox':'一朵低低的云影飘过去的时候，我在路边遇到了一段特别想讲给你听的时光：',
    'pocket-glider':'我本来正低头看路边的落叶，一抬眼就撞见了今天最惊喜的画面：',
    'moon-bunny':'风吹动草梢发出沙沙轻响，我放轻脚步，把这一刻悄悄收进了信封：',
    'cottonpod-hermit':'我刚把小脑袋从壳里探出来透透气，就被眼前的热闹吸引住了：',
    'moss-dragon':'今天合上书本抬头远望时，风景好像突然活过来跟我打了个招呼：'
  }},
  {id:'flavor',badge:'🍵 风物气味笺',openings:{
    'nuonuo-seal':'拍拍圆滚滚的肚皮向你报告，这座远方的空气里藏着让人心情变好的味道：',
    'cloud-fox':'我的鼻子今天可忙啦！微风里混着水汽、草木和人间烟火的气息：',
    'pocket-glider':'我打开你替我装好的口粮袋咬了一小口，配着眼前的风景格外香甜：',
    'moon-bunny':'就像我耳朵边常带的桂花香一样，今天到的地方也有属于它自己的气味记忆：',
    'cottonpod-hermit':'背着小屋慢慢散步时，连吹进壳里的微风都带着当地特有的温度：',
    'moss-dragon':'古人说行万里路会有不同的风土气息，今天我终于亲身闻到啦：'
  }},
  {id:'poetic',badge:'🌙 慢行悄悄话',openings:{
    'nuonuo-seal':'写这封信的时候，我正托着腮帮子想：要是你也在旁边一起看该多好呀——',
    'cloud-fox':'天边的云走得很慢很慢，我也跟着放慢脚步，在明信片正面写下给你的悄悄话：',
    'pocket-glider':'把今天攒下的开心摊在信纸上数了数，最大的一颗还是想寄回小屋给你：',
    'moon-bunny':'风很轻，脚步也很轻，我借着路边的光亮一笔一画给你写信：',
    'cottonpod-hermit':'缩在温暖的小壳里听了一会儿外面的风声，忽然很想念窗边看书的你：',
    'moss-dragon':'灯火亮起来的时候，我把今天最安静也最难忘的一幕整理成了这封信：'
  }},
  {id:'postal',badge:'📮 盖章长明信片',openings:{
    'nuonuo-seal':'今天盖邮戳的时候，我特意挑了最端正的一角，把一路上的见闻全装进来：',
    'cloud-fox':'这是一封追着好天气寄出的长明信片，正面是风景，背面写满了我的碎碎念：',
    'pocket-glider':'怕一张薄薄的卡片装不下，我把字写得密密麻麻，连页边都画了小记号：',
    'moon-bunny':'寄信前我把信封折得方方正正，先把今天最打动我的这段见闻讲给你听：',
    'cottonpod-hermit':'每走过一站，我的壳上就像多了一枚无形的纪念章，今天这枚格外特别：',
    'moss-dragon':'在当地邮筒投递前，我又认真检查了一遍标点，向你呈上今日份远方来信：'
  }}
];

const MOOD_CLOSINGS={
  dawn:'清晨第一缕微光把远处的轮廓染成了柔和的蜜桃色，露水还没散尽，连深呼吸都觉得清甜。想把这份早起的好精神也分一半给今天做计划的你！',
  day:'晴朗午后的阳光暖融融地洒在肩头，影子短短的，路边的色彩鲜亮得像刚挤出来的水彩。你在家里也要记得喝口水、伸个懒腰呀。',
  dusk:'傍晚的落日把整片天空慢慢调成了琥珀与橘子汽水的颜色，归鸟成群飞过天际，我也把画笔收好，心里满当当都是安宁。',
  night:'夜幕垂下来后，头顶亮起了亮晶晶的星子，远处的灯火一点点亮起。不管走多远，想到家里那扇亮着暖光的木窗，脚下就充满了力气。'
};

const CAMEO_SNIPPETS={
  fox:'更惊喜的是，路边一只毛茸茸的小狐狸远远望了我一眼，尾巴一摆，像是在替当地欢迎我呢！',
  deer:'画到一半时，一只温顺的小鹿踩着轻巧的步子从林间走过，歪着脑袋看了看我的画纸！',
  dove:'几只白鸽扑棱棱落在不远处的石栏上咕咕叫着，一点也不怕生，陪我晒了好一会儿太阳。',
  alpaca:'坡道边一只软乎乎的小羊驼慢悠悠地嚼着青草，长睫毛忽闪忽闪的，可爱极啦！',
  turtle:'低头看水波的时候，一只慢吞吞的绿海龟刚好浮上来换气，划出一圈温柔的涟漪。'
};

export function composeReturnLetter({placeId,baseStory,form='nuonuo-seal',mood='day',cameo='',effects=[],seed=0}){
  const style=LETTER_STYLES[seed%LETTER_STYLES.length];
  const opening=style.openings[form]||style.openings['nuonuo-seal'];
  const closing=MOOD_CLOSINGS[mood]||MOOD_CLOSINGS.day;
  const cameoLine=cameo&&CAMEO_SNIPPETS[cameo]?' '+CAMEO_SNIPPETS[cameo]:'';
  const gearLine=effects.includes('pet_sketchbook')?'随身带的速写本已经画满了整整三页，回去一页页翻给你看。'
    :effects.includes('pet_compass')?'口袋里的小罗盘指针稳稳转着，帮我找到了视野最棒的观景角。'
    :effects.includes('pet_lantern')?'我点亮了你给我带的月光小提灯，暖黄的光晕把脚下的路照得格外温柔。'
    :effects.includes('pet_tent')?'走累了就在安全的小坡边支起露营包歇了歇脚，听够了风声才继续出发。':'';
  return {
    letterBadge:style.badge,
    text:`${opening}\n\n${baseStory}\n\n${closing}${cameoLine}${gearLine?' '+gearLine:''}`
  };
}

export function composeMidwayLetter({midway,routeName,form='nuonuo-seal',seed=0}){
  const postscripts=[
    '我在信纸角落随手画了一幅小画，虽然被风吹歪了一点点，但你一定能认出来！',
    '歇脚的时候我在背面添了一幅铅笔小画，等我回家再涂上最漂亮的水彩。',
    '随信附上一幅刚描好的路边小画，猜猜我下一站会在哪个转角停下来？',
    '趁等船和看路标的工夫，我在纸边画了一幅圆乎乎的小画寄给你当书签。'
  ];
  const signoffs={
    'nuonuo-seal':'—— 正在慢吞吞看风景的糯糯伙伴',
    'cloud-fox':'—— 摇着尾巴追云朵的小狐伙伴',
    'pocket-glider':'—— 小兜里装满新发现的鼯鼠伙伴',
    'moon-bunny':'—— 竖着长耳朵听风声的小兔伙伴',
    'cottonpod-hermit':'—— 背着小壳稳稳赶路的寄居蟹伙伴',
    'moss-dragon':'—— 捧着笔记本认真做记录的小书龙'
  };
  return `${midway}\n\n我还在「${routeName}」的半路上，${postscripts[seed%postscripts.length]}要是你有空，也可以到旅行手账给我回一张方向小便签哦！\n${signoffs[form]||signoffs['nuonuo-seal']}`;
}

export function midwayChoices(placeId){
  const isNature=TRAVEL_NOTES[placeId]?.theme==='nature';
  return isNature?[
    {id:'high',label:'去高处静静等晚霞与星空',mood:'dusk',postscript:'收到你的回信后，我爬上高处多等了一会儿，把漫天柔和的霞光也画进了明信片背角！'},
    {id:'friend',label:'蹲在水边观察路过的小动物',mood:'day',cameo:true,postscript:'听你的话在草丛边安静等了一会儿，真的有一位当地小动物探出脑袋，陪我一起合了影！'}
  ]:[
    {id:'high',label:'等暮色亮灯时再画一张夜景',mood:'night',postscript:'收到你的叮嘱，我特意留到星光升起才收起画本，夜晚的轮廓比白天还要温柔。'},
    {id:'friend',label:'去安静的小巷寻访手作与邻里',mood:'dawn',cameo:true,postscript:'顺着你指的小巷拐进去，不仅遇见了早起觅食的小邻居，还学到了当地匠人的小巧思！'}
  ];
}
