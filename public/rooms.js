// A remembered choice belongs to one account and must still be an active room.
export function receivingRooms(state) {
  return state.rooms.filter(room => room.status === 'active' &&
    room.learner_id === state.user.id && (room.giver_id || room.family_id));
}

export function initialRoom(state, remembered = '') {
  if (state.rooms.some(room => room.id === remembered && room.status === 'active')) return remembered;
  const choices = receivingRooms(state);
  return choices.length === 1 ? choices[0].id : state.space.id;
}

export const roomMemoryKey = userId => `starlight:last-room:${userId}`;

export function renameNotice(state,esc,time){
  const r=state.space.rename;
  return r?`<p class="room-rename-note" role="status">名字有效至 ${esc(time(r.expires))} · 到期恢复${r.defaultName?'「'+esc(r.defaultName)+'」':'默认小屋名'}</p>`:state.space.roomName?'<p class="room-rename-note">小屋名字 · 长期有效</p>':'';
}

// A perspective changes presentation only; the server still authorizes every action.
export function roomPerspective(state, requested = '') {
  const manages = !!state.admin && !!state.space.canFulfill;
  if (!manages) return 'receive';
  if (requested === 'preview' || requested === 'manage') return requested;
  return (state.family?.mode==='guardian'||(!state.family&&!state.space.isSelf))?'manage':'receive';
}

export function canUseRewards(state, perspective) {
  return perspective === 'receive' && state.space.canParticipate!==false && state.space.isSelf && state.space.status === 'active';
}

export function roomNavigation(state, perspective) {
  if (perspective === 'manage') {
    const items = [
      {page:'admin', tab:'prizes', icon:'gift', label:'奖品管理'},
      {page:'admin', tab:'odds', icon:'spark', label:'抽奖配置'},
      {page:'admin', tab:'redemptions', icon:'card', label:'报销核销'},
      {page:'today', icon:'chart', label:state.family?'家人进展':'伙伴进展'},
      {page:'timeline', icon:'history', label:'时间轴'},
      {page:'reading', icon:'book', label:'阅读进展'},
      {page:'admin', tab:'settings', icon:'settings', label:'小屋规则'},
    ];
    return state.space.status === 'active' ? items : items.filter(n=>['today','timeline','reading'].includes(n.page)||n.tab==='redemptions');
  }
  return [
    {page:'today', icon:'sun', label:'今日计划'},
    {page:'timeline', icon:'history', label:'时间轴'},
    {page:'reading', icon:'book', label:'阅读小屋'},
    {page:'shop', icon:'gift', label:'奖励商城'},
    {page:'cards', icon:'card', label:perspective==='preview'?'卡包预览':'我的卡包'},
    {page:'lucky', icon:'spark', label:perspective==='preview'?'抽奖预览':'抽奖'},
    {page:'growth', icon:'leaf', label:'成长记录'},
  ];
}

export function renameCardOffer(admin) {
  const prize = admin.prizes.find(p=>(!p.channel||p.channel==='shop')&&p.effect==='room_rename'&&p.active&&p.stock>0)
    || admin.prizes.find(p=>(!p.channel||p.channel==='shop')&&p.effect==='room_rename');
  if (prize) return {kind:!prize.active?'inactive':prize.stock>0?'active':'empty',prize};
  const removed = admin.removedPrizes.find(p=>(!p.channel||p.channel==='shop')&&p.effect==='room_rename');
  return removed ? {kind:'removed',prize:removed} : {kind:'missing'};
}
