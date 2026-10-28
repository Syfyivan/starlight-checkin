// Experience unlocks the opportunity; a saved action advances the companion.
export const PET_GROWTH_STAGES=[
 {name:'云朵蛋',xp:0,visual:'egg',action:'轻轻孵化'},
 {name:'糯糯幼崽',xp:0,visual:'young',action:'长大一点'},
 {name:'元气伙伴',xp:600,visual:'winged',action:'迎接灵蛋'},
 {name:'星辉灵蛋',xp:2400,visual:'spirit-egg',action:'孵化新模样'},
 {name:'月光幼灵',xp:3400,visual:'moon',action:'成为星海伙伴'},
 {name:'星海伙伴',xp:6000,visual:'star',action:''}
];
export function growthState(stage,xp){
 const current=PET_GROWTH_STAGES[stage],next=PET_GROWTH_STAGES[stage+1];
 return {stage,name:current.name,visual:current.visual,isEgg:stage===0||stage===3,next:next?{name:next.name,xp:next.xp,action:current.action,eligible:xp>=next.xp,remaining:Math.max(0,next.xp-xp)}:null};
}
export function eggPortrait(spirit=false){
 const shell=spirit?'#e6dff5':'#f4e8cf',edge=spirit?'#9a87b4':'#b69a74',pattern=spirit?'#b3a1d5':'#d9bd86';
 return `<svg class="pet-egg-art" viewBox="0 0 512 512" role="img" aria-label="${spirit?'星辉灵蛋':'云朵蛋'}"><ellipse cx="256" cy="402" rx="104" ry="13" fill="#59785e" opacity=".1"/><g class="pet-egg-shell"><path d="M146 295C146 204 211 115 256 115s110 89 110 180c0 72-44 108-110 108s-110-36-110-108Z" fill="${shell}" stroke="${edge}" stroke-width="3"/><path d="M165 283c3-68 53-141 86-149-35 41-53 105-49 159 2 41 18 72 37 90-50-7-75-39-74-100Z" fill="#fffaf1" opacity=".65"/><path d="M174 331q24-14 44 1t42 0 43 0 42-2" fill="none" stroke="${pattern}" stroke-width="9" opacity=".65"/><path d="m255 211 9 20 22 3-16 15 4 22-19-11-19 11 4-22-16-15 22-3Z" fill="${pattern}"/><path d="m256 216 4 12" stroke="#fffaf4" stroke-width="3" stroke-linecap="round"/><circle cx="204" cy="282" r="7" fill="${pattern}"/><circle cx="307" cy="288" r="5" fill="${pattern}"/><path d="M229 298q27 17 54 0" fill="none" stroke="${edge}" stroke-width="3" stroke-linecap="round"/>${spirit?'<path d="M291 157a23 23 0 1 0 22 34c-24 4-32-14-22-34Z" fill="#fff6d7"/>':''}</g><g fill="${pattern}" class="egg-sparkles"><path d="m127 201 4 9 10 4-10 4-4 10-4-10-10-4 10-4ZM381 258l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/><circle cx="368" cy="179" r="4"/><circle cx="132" cy="353" r="4"/></g></svg>`;
}
