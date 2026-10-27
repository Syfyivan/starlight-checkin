// Integer cents, with rounding applied once to the final total.
// Equal cards receive the original total bonus; otherwise only the smallest card grows.
export function mergeAmount(values){
  if(values.length<2)return values.reduce((a,b)=>a+b,0);
  const sum=values.reduce((a,b)=>a+b,0),small=Math.min(...values);
  return Math.ceil((sum*4+(values.every(v=>v===small)?sum:small))/400)*100;
}
