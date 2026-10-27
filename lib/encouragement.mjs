const ENDPOINT='https://v1.hitokoto.cn/?c=i&min_length=8&max_length=30';
const AUTHORS=new Set('李白 杜甫 王维 苏轼 辛弃疾 李清照 陆游 白居易 王之涣 王昌龄 孟浩然 刘禹锡 柳宗元 杜牧 李商隐 韩愈 柳永 欧阳修 王安石 杨万里 朱熹 陶渊明 曹操 曹植 屈原 孟郊 贺知章 岑参 高适 王勃 骆宾王 陈子昂 张九龄 张若虚 韦应物 刘长卿 温庭筠 韦庄 周邦彦 秦观 姜夔 范仲淹 范成大 晏殊 晏几道 苏辙 苏洵 郑燮 龚自珍 于谦 王冕 文天祥 王贞白 黄庭坚 张孝祥 纳兰性德 蒲松龄 佚名 荀子 老子 孔子 孟子'.split(' '));
const clean=v=>typeof v==='string'?v.trim():'';
export function normalizeQuote(data){
  const text=clean(data?.hitokoto),author=clean(data?.from_who),work=clean(data?.from),uuid=clean(data?.uuid);
  if(data?.type!=='i'||Array.from(text).length<8||Array.from(text).length>30||!AUTHORS.has(author)||!work||work.length>60)return null;
  if(!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(uuid)||/[<>\x00-\x1f\x7f]|https?:|www\./i.test(text+work))return null;
  // A bounded classical-poetry feed: prefer gentle/learning themes, reject obvious
  // violence, adult or discouraging wording. This is not a semantic guarantee.
  if(/杀|死|亡|血|恨|愁|悲|痛|泪|淫|酒|醉|战争|绝望|枪|毒|粪|傻|蠢|废物/.test(text)||!/[春光花星月山海学书读登高少年风帆青鸟竹梦路日天楼勤志行]/.test(text))return null;
  return {text,attribution:author+'《'+work+'》',source:'一言·诗词',url:'https://hitokoto.cn/?uuid='+uuid};
}
export class Encouragement {
  constructor({fetcher=fetch,clock=Date.now}={}){this.fetcher=fetcher;this.clock=clock;this.nextAt=0;this.quote=null;this.pending=null;}
  async get(){
    if(this.pending)return this.pending;
    if(this.clock()<this.nextAt)return {quote:this.quote};
    this.nextAt=this.clock()+30000;
    this.pending=this.load();try{return await this.pending;}finally{this.pending=null;}
  }
  async load(){
    try{
      const r=await this.fetcher(ENDPOINT,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(2000)});
      if(!r.ok||!r.headers.get('content-type')?.includes('json'))throw Error('quote unavailable');
      const reader=r.body.getReader(),chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw Error('quote too large');}chunks.push(value);}}finally{reader.releaseLock();}
      this.quote=normalizeQuote(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    }catch{this.quote=null;}
    return {quote:this.quote};
  }
}
