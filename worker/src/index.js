// Market Pulse 3.0 — public open-data gateway, no API key required.
const ORIGIN='https://hubert066.github.io';
const LIC='https://data.gov.tw/license';
const MARKET='https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK';
const STOCKS='https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const BASE='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(o,status=200)=>new Response(JSON.stringify(o),{status,headers});
function num(v){const s=String(v??'').replaceAll(',','').trim();return s&&/^[+-]?\d+(?:\.\d+)?$/.test(s)?Number(s):null}
function day(v){const s=String(v??'').trim();let d=/^\d{7}$/.test(s)?(Number(s.slice(0,3))+1911)+'-'+s.slice(3,5)+'-'+s.slice(5):/^\d{8}$/.test(s)?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6):/^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;return d&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:null}
function quote(value,date,source,url,unit='',change=null,pct=null){return {value,date,kind:'daily',asof:null,source,url,unit,change,pct,license:source.startsWith('TWSE')?LIC:null}}
async function read(u,kind='json'){const r=await fetch(u,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('HTTP '+r.status);return kind==='json'?r.json():r.text()}
const pct=(v,c)=>Number.isFinite(c)&&v-c>0?100*c/(v-c):null;
export function marketRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>({date:day(r.Date),value:num(r.TAIEX),change:num(r.Change),turnover:num(r.TradeValue)})).filter(r=>r.date&&r.value>0).sort((a,b)=>a.date.localeCompare(b.date))}
async function collect(){
 const yr=new Date().getUTCFullYear();
 const [m,s,t]=await Promise.allSettled([read(MARKET),read(STOCKS),read(BASE+yr,'text')]);
 const quotes={},watchlist=[],warnings=[];let history=[];
 if(m.status==='fulfilled'){history=marketRows(m.value);const r=history.at(-1);if(r){quotes.taiex=quote(r.value,r.date,'TWSE／金管會證期局・盤後','https://data.gov.tw/dataset/11672','點',r.change,pct(r.value,r.change));if(r.turnover>=0&&r.turnover!==null)quotes.turnover=quote(r.turnover/1e8,r.date,'TWSE／金管會證期局・盤後','https://data.gov.tw/dataset/11672','億元')}}
 if(!quotes.taiex)warnings.push('TWSE 大盤資料未取得');
 if(s.status==='fulfilled'&&Array.isArray(s.value)){
 const selected=new Set(['2330','2454','2308','2317','0050','0052','00662','00646']);
 const rows=s.value.map(r=>({code:String(r.Code??''),name:String(r.Name??''),date:day(r.Date),value:num(r.ClosingPrice),change:num(r.Change)})).filter(r=>r.date&&r.value>0);
 const latest=rows.map(r=>r.date).sort().at(-1);const current=rows.filter(r=>r.date===latest);
 for(const r of current){if(selected.has(r.code)){const q={...quote(r.value,r.date,'TWSE／金管會證期局・盤後','https://data.gov.tw/dataset/11549','元',r.change,pct(r.value,r.change)),symbol:r.code+'.TW',name:r.name};watchlist.push(q);if(r.code==='2330')quotes.tsmc=q}}
 }if(!watchlist.length)warnings.push('個股日成交資料缺少可核對日期或來源未連線');
 if(t.status==='fulfilled'){const records=[...t.value.matchAll(/<(?:m:)?properties\b[^>]*>([\s\S]*?)<\/(?:m:)?properties>/g)].map(x=>{const a=x[1].match(/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/),b=x[1].match(/<d:BC_10YEAR(?:\s[^>]*)?>([\d.]+)<\/d:BC_10YEAR>/);return {date:a?day(a[1]):null,value:b?num(b[1]):null}}).filter(r=>r.date&&r.value!==null).sort((a,b)=>a.date.localeCompare(b.date));const r=records.at(-1);if(r)quotes.us10y=quote(r.value,r.date,'U.S. Treasury・每日 CMT','https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics','%')}
 if(!quotes.us10y)warnings.push('美國財政部 10 年期 CMT 未取得');
 return {status:Object.keys(quotes).length?'ok':'empty',mode:'open_daily',generated_at:new Date().toISOString(),quotes,watchlist,history,points:[],warnings,license:LIC};
}
export default {async fetch(req,env,ctx){const u=new URL(req.url);if(req.method!=='GET'||u.pathname!=='/quotes')return reply({status:'not_found'},404);
 const key=new Request(u.origin+'/cache/open-daily-v1');const cached=await caches.default.match(key);if(cached)return new Response(cached.body,{headers});
 try{const data=await collect();if(data.status!=='ok')return reply(data,502);ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=300'}})));return reply(data)}catch{return reply({status:'upstream_error'},502)}
}};
