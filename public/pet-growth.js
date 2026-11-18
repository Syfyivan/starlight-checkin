// Experience unlocks the opportunity; a saved action advances each companion through its 6-stage arc.
export const SPECIES_GROWTH={
  'nuonuo-seal':['云朵蛋','糯糯幼崽','元气伙伴','星辉灵蛋','月光幼灵','星海伙伴'],
  'pocket-glider':['嫩叶蛋','芽芽鼯鼠','橡果伙伴','晨露灵蛋','林风幼灵','森冠领航员'],
  'cloud-fox':['晴云蛋','绒云幼狐','晴风伙伴','朝霞灵蛋','霞光幼灵','云海巡游者'],
  'moon-bunny':['桂花蛋','糯耳幼兔','采露伙伴','月影灵蛋','银桂幼灵','月庭守望者'],
  'cottonpod-hermit':['海盐蛋','棉苞幼蟹','蓬松伙伴','潮汐灵蛋','海盐幼灵','星屿棉桃蟹'],
  'moss-dragon':['古卷蛋','芽角幼龙','藏书伙伴','琥珀灵蛋','琥珀幼灵','博物星墨龙']
};

export const PET_GROWTH_STAGES=[
  {name:'云朵蛋',xp:0,visual:'egg',action:'轻轻孵化'},
  {name:'糯糯幼崽',xp:0,visual:'young',action:'长大一点'},
  {name:'元气伙伴',xp:600,visual:'winged',action:'迎接灵蛋'},
  {name:'星辉灵蛋',xp:2400,visual:'spirit-egg',action:'孵化新模样'},
  {name:'月光幼灵',xp:3400,visual:'moon',action:'成为终阶伙伴'},
  {name:'星海伙伴',xp:6000,visual:'star',action:''}
];

export function stagesFor(form='nuonuo-seal'){
  const names=SPECIES_GROWTH[form]||SPECIES_GROWTH['nuonuo-seal'];
  return PET_GROWTH_STAGES.map((s,i)=>({...s,name:names[i]||s.name,action:i===4?'成为'+names[5]:s.action}));
}

export function growthState(stage,xp,form='nuonuo-seal'){
  const list=stagesFor(form),current=list[stage]||list[1],next=list[stage+1];
  return {stage,name:current.name,visual:current.visual,isEgg:stage===0||stage===3,next:next?{name:next.name,xp:next.xp,action:current.action,eligible:xp>=next.xp,remaining:Math.max(0,next.xp-xp)}:null};
}

const EGG_STYLES={
  'nuonuo-seal':{shell:'#f4e8cf',edge:'#8f6e52',pattern:'#d9bd86',spiritShell:'#e6dff5',spiritEdge:'#7d679a',spiritPattern:'#b3a1d5',motif:'star'},
  'pocket-glider':{shell:'#e5eed9',edge:'#667854',pattern:'#9cb480',spiritShell:'#dcebe2',spiritEdge:'#567668',spiritPattern:'#7eb39c',motif:'leaf'},
  'cloud-fox':{shell:'#e4eff7',edge:'#657e96',pattern:'#93bbd8',spiritShell:'#f6e4df',spiritEdge:'#986e6c',spiritPattern:'#e0a899',motif:'cloud'},
  'moon-bunny':{shell:'#f6eadc',edge:'#8d715c',pattern:'#e2ba78',spiritShell:'#ece3f6',spiritEdge:'#7b6893',spiritPattern:'#c6aee4',motif:'moon'},
  'cottonpod-hermit':{shell:'#e3f0ea',edge:'#648078',pattern:'#df9d84',spiritShell:'#dfe9f5',spiritEdge:'#5f7591',spiritPattern:'#8fb4d8',motif:'shell'},
  'moss-dragon':{shell:'#efe8cf',edge:'#736d4b',pattern:'#8ba678',spiritShell:'#f3e4c6',spiritEdge:'#8c6d46',spiritPattern:'#d4a259',motif:'sprout'}
};

export function eggPortrait(spirit=false,form='nuonuo-seal'){
  const st=EGG_STYLES[form]||EGG_STYLES['nuonuo-seal'];
  const shell=spirit?st.spiritShell:st.shell,edge=spirit?st.spiritEdge:st.edge,pattern=spirit?st.spiritPattern:st.pattern;
  const label=stagesFor(form)[spirit?3:0].name;
  const emblem=st.motif==='leaf'
    ?`<path d="M256 205q32 10 24 44-24 14-44-10-4-24 20-34Z" fill="${pattern}"/><path d="M242 238q14-14 32-24" fill="none" stroke="#fffaf0" stroke-width="3" stroke-linecap="round"/>`
    :st.motif==='cloud'
    ?`<path d="M222 252q-12-18 8-22 10-20 30-6 20-6 20 16 10 12-12 14h-46Z" fill="${pattern}"/>`
    :st.motif==='moon'
    ?`<path d="M268 208a26 26 0 1 0 16 42c-22 2-30-18-16-42Z" fill="${pattern}"/>`
    :st.motif==='shell'
    ?`<path d="M232 248q24-38 48 0l-10 14h-28Z" fill="${pattern}"/><path d="M256 228v34m-12-28 6 28m18-28-6 28" stroke="#fffaf0" stroke-width="2.5"/>`
    :st.motif==='sprout'
    ?`<path d="M256 258v-32m0 10q-22-18-26 2 10 14 26-2Zm0-4q22-18 26 2-10 14-26-2Z" fill="${pattern}" stroke="${edge}" stroke-width="2.5"/>`
    :`<path d="m255 211 9 20 22 3-16 15 4 22-19-11-19 11 4-22-16-15 22-3Z" fill="${pattern}"/><path d="m256 216 4 12" stroke="#fffaf4" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg class="pet-egg-art" viewBox="0 0 512 512" role="img" aria-label="${label}"><ellipse cx="256" cy="402" rx="104" ry="13" fill="#59785e" opacity=".12"/><g class="pet-egg-shell"><path d="M146 295C146 204 211 115 256 115s110 89 110 180c0 72-44 108-110 108s-110-36-110-108Z" fill="${shell}" stroke="${edge}" stroke-width="3.5"/><path d="M165 283c3-68 53-141 86-149-35 41-53 105-49 159 2 41 18 72 37 90-50-7-75-39-74-100Z" fill="#fffaf1" opacity=".68"/><path d="M174 331q24-14 44 1t42 0 43 0 42-2" fill="none" stroke="${pattern}" stroke-width="9" opacity=".65"/>${emblem}<circle cx="204" cy="282" r="7" fill="${pattern}"/><circle cx="307" cy="288" r="5" fill="${pattern}"/><path d="M229 298q27 17 54 0" fill="none" stroke="${edge}" stroke-width="3" stroke-linecap="round"/>${spirit?'<path d="M291 157a23 23 0 1 0 22 34c-24 4-32-14-22-34Z" fill="#fff6d7"/>':''}</g><g fill="${pattern}" class="egg-sparkles"><path d="m127 201 4 9 10 4-10 4-4 10-4-10-10-4 10-4ZM381 258l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/><circle cx="368" cy="179" r="4"/><circle cx="132" cy="353" r="4"/></g></svg>`;
}
