export function versionParts(value){
  if(typeof value!=='string'||!/^\d{1,6}\.\d{1,6}(?:\.\d{1,6})?$/.test(value))return null;
  const parts=value.split('.').map(Number);while(parts.length<3)parts.push(0);return parts;
}
export function appUpdateState(userAgent,release){
  const match=String(userAgent||'').match(/(?:^|\s)StarlightAndroid\/([^\s;]+)/),current=match?.[1]||null;
  if(!release||!versionParts(release.version))return {kind:'unavailable',current};
  const latest=release.version;
  // Older APKs use the stock Android WebView UA and do not expose their version.
  if(!match)return {kind:/Android.*; wv\)/.test(String(userAgent))?'unknown':'web',current:null,latest};
  const a=versionParts(current),b=versionParts(latest);
  if(!a)return {kind:'unknown',current:null,latest};
  let comparison=0;for(let i=0;i<3;i++){if(a[i]!==b[i]){comparison=a[i]<b[i]?-1:1;break;}}
  return {kind:comparison<0?'update':comparison>0?'newer':'current',current,latest};
}
export function nativeAutoUpdate(userAgent){return /(?:^|\s)StarlightAutoUpdate\/1(?:\s|$)/.test(String(userAgent||''));}
export function needsUpdateBootstrap(userAgent,release){
  const s=appUpdateState(userAgent,release);
  // Stock WebView UAs can also belong to another app; only auto-prompt our identified APKs.
  return !nativeAutoUpdate(userAgent)&&Number(release?.versionCode)>=370&&s.kind==='update';
}
