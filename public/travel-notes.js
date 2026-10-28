// Original activities based on the UNESCO references saved with each postcard.
// These are optional learning prompts; reading or answering never awards coins.
export const TRAVEL_NOTES={
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
export function packingHint(choice,effects=[]){const route=routeFor(choice,effects);return (route==='surprise'?'这一趟随心走走':`这一趟偏向${ROUTE_NAMES[route]}`)+'，优先探索还没去过的地方。';}
