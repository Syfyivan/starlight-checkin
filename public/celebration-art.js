import confetti from './vendor/canvas-confetti-1.9.4.js';

export const EFFECTS=[
  {id:'fireworks',name:'花火绽放',icon:'✺',color:'gold'},
  {id:'stars',name:'星星瀑布',icon:'✦',color:'lavender'},
  {id:'balloons',name:'云朵气球',icon:'♧',color:'peach'},
  {id:'hearts',name:'爱心花束',icon:'♡',color:'rose'},
  {id:'petals',name:'花瓣轻雨',icon:'❀',color:'rose'},
  {id:'ribbons',name:'缤纷彩带',icon:'〰',color:'gold'},
  {id:'bubbles',name:'透亮泡泡',icon:'◌',color:'aqua'},
  {id:'butterflies',name:'蝴蝶花园',icon:'⋈',color:'lavender'},
  {id:'planes',name:'纸飞机来信',icon:'➤',color:'sage'},
  {id:'fireflies',name:'萤火星河',icon:'⁂',color:'sage'},
];
const PALETTE=['#dba5ac','#dfbc70','#8fb9a9','#a6a7cf','#8fbccf'];
const customShapes={};
function shape(name,path){return customShapes[name]??=confetti.shapeFromPath({path});}
const heart=()=>shape('heart','M 0 5 C -13 -5 -9 -15 0 -8 C 9 -15 13 -5 0 5 Z');
const petal=()=>shape('petal','M 0 -10 C 11 -8 13 0 3 10 C -10 9 -12 -2 0 -10 Z');
const ribbon=()=>shape('ribbon','M -2 -10 L 2 -10 L 2 10 L -2 10 Z');
const rand=(a,b)=>a+Math.random()*(b-a),clamp=v=>Math.max(0,Math.min(1,v));
function sparkle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+r*.2,y-r*.2,x+r,y);ctx.quadraticCurveTo(x+r*.2,y+r*.2,x,y+r);ctx.quadraticCurveTo(x-r*.2,y+r*.2,x-r,y);ctx.quadraticCurveTo(x-r*.2,y-r*.2,x,y-r);ctx.fill();}

/** Each call returns a disposer; no interval, worker or external asset survives it. */
export function playCelebration(layer,id,{duration=3000}={}){
  const canvas=document.createElement('canvas');layer.append(canvas);
  const width=innerWidth,height=innerHeight,compact=width<600;
  let raf=0,closed=false,burst=null,timers=[];
  const later=(fn,ms)=>timers.push(setTimeout(()=>{if(!closed)fn();},ms));
  if(['fireworks','stars','hearts','petals','ribbons'].includes(id)){
    burst=confetti.create(canvas,{resize:true,useWorker:false,disableForReducedMotion:true});
    const base={colors:PALETTE,particleCount:compact?30:45,ticks:160,decay:.94,gravity:.6,scalar:.8};
    if(id==='fireworks'){
      [[.25,.38,0],[.73,.31,340],[.5,.48,720]].forEach(([x,y,delay])=>later(()=>{
        burst({...base,spread:360,startVelocity:compact?15:22,origin:{x,y},shapes:['circle'],gravity:.25,scalar:.65});
        burst({...base,particleCount:8,spread:360,startVelocity:9,origin:{x,y},shapes:['star'],colors:['#e5c275','#f0dba3'],scalar:1.1,gravity:.18});
      },delay));
    }else if(id==='stars'){
      for(let i=0;i<5;i++)later(()=>burst({...base,particleCount:compact?12:18,shapes:['star'],spread:65,startVelocity:8,origin:{x:.2+i*.15,y:.12},gravity:.55,scalar:rand(.65,1.05),colors:['#d3b370','#b8a9cf','#8fae9c']}),i*170);
    }else if(id==='hearts'){
      const shapes=[heart()];
      for(let i=0;i<3;i++)later(()=>burst({...base,shapes,colors:['#cc8b9c','#e7b4bb','#d5a2b6','#eac8cc'],particleCount:compact?12:20,origin:{x:.5,y:.67},spread:70,startVelocity:20+i*3,gravity:.32,scalar:rand(.45,.75)}),i*230);
    }else if(id==='petals'){
      const shapes=[petal()];
      for(let i=0;i<6;i++)later(()=>burst({...base,shapes,colors:['#e5b3c0','#f2cbd2','#c7adce','#e9c5b6'],particleCount:compact?8:13,origin:{x:rand(.1,.9),y:.05},angle:250,spread:50,startVelocity:7,gravity:.35,drift:.5,scalar:rand(.8,1.2)}),i*200);
    }else{
      const shapes=[ribbon(),'circle'];
      for(const [x,angle] of [[.08,60],[.92,120]])burst({...base,shapes,origin:{x,y:.7},angle,spread:50,startVelocity:compact?27:38,particleCount:compact?30:45,gravity:.7,scalar:.65});
    }
  }else{
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
    const count={balloons:7,bubbles:18,butterflies:compact?7:10,planes:6,fireflies:compact?22:34}[id]||18;
    const particles=Array.from({length:count},(_,i)=>({i,x:rand(.08,.92),y:rand(.15,.8),r:rand(12,26),phase:rand(0,Math.PI*2),delay:rand(0,.16),color:PALETTE[i%PALETTE.length]}));
    const start=performance.now();
    function frame(at){
      if(closed)return;
      const t=clamp((at-start)/duration);ctx.clearRect(0,0,width,height);
      for(const p of particles){
        const u=clamp((t-p.delay)/(1-p.delay));if(!u)continue;
        const alpha=clamp(u*7)*clamp((1-u)*5);ctx.save();ctx.globalAlpha=alpha;
        if(id==='balloons'){
          const x=(p.i+.55)/count*width+Math.sin(u*4+p.phase)*12,y=height+55-u*(height*.85+110),r=compact?16:23;
          ctx.strokeStyle='#9a9f9275';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+r*1.25);ctx.bezierCurveTo(x-12,y+65,x+12,y+75,x-5,y+105);ctx.stroke();
          const g=ctx.createRadialGradient(x-r*.35,y-r*.5,1,x,y,r*1.4);g.addColorStop(0,'#fff9f2');g.addColorStop(.3,p.color);g.addColorStop(1,p.color+'b8');ctx.fillStyle=g;
          ctx.shadowColor=p.color+'45';ctx.shadowBlur=10;ctx.beginPath();ctx.ellipse(x,y,r,r*1.24,Math.sin(u*4)*.1,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
          ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(x,y+r*1.18);ctx.lineTo(x-3,y+r*1.42);ctx.lineTo(x+3,y+r*1.42);ctx.fill();
          ctx.strokeStyle='#fff9';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x-r*.3,y-r*.35,r*.3,r*.42,-.2,Math.PI,Math.PI*1.7);ctx.stroke();sparkle(ctx,x+r*1.7,y-12,4,'#d9bc72');
        }else if(id==='bubbles'){
          const x=p.x*width+Math.sin(u*5+p.phase)*22,y=height*(1.04-u*.8)-p.i*7,r=p.r*(compact?.8:1);
          const g=ctx.createRadialGradient(x-r*.2,y-r*.2,r*.1,x,y,r);g.addColorStop(0,'#effaf800');g.addColorStop(.74,'#c7e6e21c');g.addColorStop(1,p.color+'90');ctx.fillStyle=g;ctx.strokeStyle=p.color+'b0';ctx.lineWidth=1;
          ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r*.78,Math.PI*1.08,Math.PI*1.48);ctx.stroke();sparkle(ctx,x+r*.53,y-r*.6,3,'#fff');
        }else if(id==='butterflies'){
          const x=p.x*width+Math.sin(u*5+p.phase)*width*.12,y=height*(.78-u*.5)+Math.cos(u*4+p.phase)*30,size=compact?12:17;
          ctx.translate(x,y);ctx.rotate(Math.sin(u*6+p.phase)*.25);ctx.scale(.32+Math.abs(Math.sin(u*20+p.phase))*.68,1);
          for(const side of [-1,1]){ctx.save();ctx.scale(side,1);const g=ctx.createLinearGradient(0,0,size*1.8,-size);g.addColorStop(0,'#fff4e5');g.addColorStop(.7,p.color);g.addColorStop(1,p.color+'aa');ctx.fillStyle=g;ctx.strokeStyle=p.color;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(size*.1,-size*1.7,size*2,-size*1.7,size*1.4,-size*.1);ctx.bezierCurveTo(size*2,size*1.2,size*.4,size*1.6,0,0);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff7';ctx.beginPath();ctx.moveTo(1,0);ctx.lineTo(size*.95,-size*.75);ctx.moveTo(1,0);ctx.lineTo(size*.8,size*.6);ctx.stroke();ctx.restore();}
          ctx.fillStyle='#657766';ctx.beginPath();ctx.ellipse(0,0,1.5,size*.6,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#657766';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,-size*.4);ctx.quadraticCurveTo(-2,-size,-5,-size);ctx.moveTo(0,-size*.4);ctx.quadraticCurveTo(2,-size,5,-size);ctx.stroke();
        }else if(id==='planes'){
          const v=clamp(u*1.25),x=-45+v*(width+90),y=height*(.65-p.i*.067)-Math.sin(v*Math.PI)*height*.2,r=compact?13:18;
          ctx.strokeStyle=p.color+'75';ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(x-70,y+32);ctx.quadraticCurveTo(x-45,y+10,x-14,y+4);ctx.stroke();ctx.setLineDash([]);ctx.translate(x,y);ctx.rotate(-.22+v*.2);
          ctx.shadowColor='#7a9b8a22';ctx.shadowBlur=6;ctx.fillStyle='#fffcf3';ctx.strokeStyle=p.color;ctx.beginPath();ctx.moveTo(r*1.5,-r*.7);ctx.lineTo(-r*1.3,-r*.25);ctx.lineTo(-r*.3,r*.15);ctx.lineTo(-r*.12,r);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;
          ctx.fillStyle=p.color+'b0';ctx.beginPath();ctx.moveTo(r*1.5,-r*.7);ctx.lineTo(-r*.3,r*.15);ctx.lineTo(-r*.12,r);ctx.closePath();ctx.fill();ctx.stroke();
        }else{
          const x=p.x*width+Math.sin(u*3+p.phase)*35,y=height*(.72-u*.35)+Math.cos(u*5+p.phase)*28,glow=.6+.4*Math.sin(u*11+p.phase),r=p.i%3?2.4:4;
          ctx.globalAlpha*=glow;const g=ctx.createRadialGradient(x,y,0,x,y,17);g.addColorStop(0,'#dfc36995');g.addColorStop(.3,'#e3d49445');g.addColorStop(1,'#efe6b500');ctx.fillStyle=g;ctx.fillRect(x-17,y-17,34,34);sparkle(ctx,x,y,r,'#beaa61');
          if(p.i%4===0){ctx.strokeStyle='#bdc5aa45';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+26,y-35);ctx.lineTo(x+50,y-20);ctx.stroke();sparkle(ctx,x+26,y-35,2,'#a6b894');}
        }
        ctx.restore();
      }
      if(t<1)raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
  }
  return ()=>{closed=true;cancelAnimationFrame(raf);timers.forEach(clearTimeout);burst?.reset();canvas.remove();};
}
