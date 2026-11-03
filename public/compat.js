// Keep the startup path compatible with older Android WebViews (Chromium 80+).
// Use the same cryptographic source when randomUUID is not yet available.
export function requestId(source=globalThis.crypto){
  if(typeof source?.randomUUID==='function')return source.randomUUID();
  if(typeof source?.getRandomValues!=='function')throw new Error('安全连接尚未准备好，请重新打开小屋');
  const bytes=source.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

// Include JSON body reading in the timeout, and release the timer on every path.
export async function fetchJSON(url,options={},timeout=25000){
  const controller=new AbortController();let expired=false;
  const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();let data;
    try{data=JSON.parse(text);}catch{}
    if(data===null||typeof data!=='object'){
      // A reverse proxy may return an empty body or an HTML error page. Never
      // infer whether a write committed from an unreadable response.
      const message=response.status===401?'登录状态过期啦，请重新登录':response.status===403?'这次操作暂时没有权限，请刷新后确认':response.status===429?'操作有点频繁，稍等一会儿再试吧':'暂时没收到完整回复，请保留当前页面，稍后再试一次';
      if(!response.ok)return {response,data:{error:message}};
      const error=new Error(message);error.name='ResponseError';error.status=response.status;throw error;
    }
    return {response,data};
  }catch(error){
    if(expired)throw new Error('连接有点慢，请保留当前页面，检查网络后再试一次');
    if(error instanceof TypeError||error.name==='NetworkError')throw new Error('网络暂时没连上，请保留当前页面，连接恢复后再试一次');
    throw error;
  }finally{clearTimeout(timer);}
}
