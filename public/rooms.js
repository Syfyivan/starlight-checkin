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
