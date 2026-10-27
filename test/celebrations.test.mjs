import {test} from 'node:test';
import assert from 'node:assert/strict';
import {celebrateTask,cleanup} from '../public/celebrations.js';
import {LOCAL_MESSAGES,ShuffleBag} from '../public/celebration-content.js';

test('完成鼓励一轮不重复，文本不作为 HTML，快速完成不会堆积浮层',()=>{
 const originals=Object.fromEntries(['document','localStorage','matchMedia'].map(k=>[k,globalThis[k]])),nodes=[],storage=new Map();
 const element=tag=>({tag,children:[],attributes:{},textContent:'',append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1);}});
 globalThis.document={hidden:false,body:{append(el){nodes.push(el);}},createElement:element};
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 try{const messages=[];for(let i=0;i<LOCAL_MESSAGES.length;i++){celebrateTask({taskId:'test-'+i,title:'<img onerror=bad()>',coins:20});assert.equal(nodes.length,1);messages.push(nodes[0].children.find(n=>n.tag==='strong').textContent);assert.ok(!nodes.some(n=>n.tag==='img'));}assert.equal(messages.length,96);assert.equal(new Set(messages).size,messages.length);cleanup();assert.equal(nodes.length,0);}
 finally{cleanup();for(const [k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('轮换进度刷新后继续，一轮内不重复，轮次交界也不连着重复',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 let bag=new ShuffleBag(10,'effects',{storage,random:()=>.4});const first=[bag.next(),bag.next(),bag.next()];
 bag=new ShuffleBag(10,'effects',{storage,random:()=>.4});while(first.length<10)first.push(bag.next());
 assert.equal(new Set(first).size,10);const second=Array.from({length:10},()=>bag.next());assert.equal(new Set(second).size,10);assert.notEqual(first.at(-1),second[0]);
});

test('损坏或旧版轮换缓存安全重建；存储被禁用仍能轮换',()=>{
 for(const raw of ['not-json',JSON.stringify({size:10,bag:[99]}),JSON.stringify({size:10,bag:[2,2]}),JSON.stringify({size:9,bag:[0]})]){
  const bag=new ShuffleBag(10,'effects',{storage:{getItem:()=>raw,setItem(){throw Error('blocked');}}});const all=Array.from({length:10},()=>bag.next());assert.equal(new Set(all).size,10);assert.ok(all.every(n=>n>=0&&n<10));
 }
});
