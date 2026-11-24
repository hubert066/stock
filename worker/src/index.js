// Market Pulse 3.0 — authorized feed gateway. No credentials in public files.
const ORIGIN='https://hubert066.github.io';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const allowed=['taiex','tsmc','turnover','advancers','decliners','sp500','nasdaq','dow','russell','sox','vix','usd_twd','us10y','es','nq','tx'];
function normalize(raw,now=Date.now()){
 const quotes={};
 for(const k of allowed){const q=raw.quotes?.[k];if(!q||!finite(q.value)||!q.asof||!Number.isFinite(Date.parse(q.asof))||Date.parse(q.asof)>now+60000)continue;
 quotes[k]={value:q.value,pct:finite(q.pct)?q.pct:null,change:finite(q.change)?q.change:null,asof:q.asof,source:String(q.source||'Authorized feed').slice(0,100),unit:String(q.unit||'').slice(0,20),delay_minutes:finite(q.delay_minutes)?Math.max(0,q.delay_minutes):null};}
 const points=(Array.isArray(raw.points)?raw.points:[]).filter(p=>finite(p.value)&&Number.isFinite(Date.parse(p.asof))&&Date.parse(p.asof)<=now+60000).map(p=>({asof:p.asof,value:p.value})).sort((a,b)=>Date.parse(a.asof)-Date.parse(b.asof)).slice(-400);
 return {status:Object.keys(quotes).length?'ok':'empty',generated_at:new Date(now).toISOString(),quotes,points};
}
const headers={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers});
export default {async fetch(req,env,ctx){
 const u=new URL(req.url);
 if(req.method!=='GET'||u.pathname!=='/quotes')return reply({status:'not_found'},404);
 if(!env.FEED_URL||env.PUBLIC_DISPLAY_AUTHORIZED!=='true')return reply({status:'not_configured',message:'Authorized public-display feed not configured'},503);
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==ORIGIN)return reply({status:'origin_not_allowed'},403);
 const cache=caches.default,key=new Request(u.origin+'/quotes-v1');const cached=await cache.match(key);if(cached){return new Response(cached.body,{headers})}
 try{
  const upstream=new URL(env.FEED_URL);if(upstream.protocol!=='https:')throw Error('HTTPS required');
  const r=await fetch(upstream,{headers:{Accept:'application/json',...(env.FEED_TOKEN?{Authorization:'Bearer '+env.FEED_TOKEN}:{})},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('upstream error');
  const data=normalize(await r.json());
  if(data.status!=='ok')return reply(data,502);
  ctx.waitUntil(cache.put(key,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=55'}})));
  return reply(data);
 }catch(e){return reply({status:'upstream_error',message:'Quote provider unavailable'},502)}
}};
export {normalize};
