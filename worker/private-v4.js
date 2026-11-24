// Market Pulse 4.0 Private — deploy only to the Access-protected worker.
// FUGLE_API_KEY is a Cloudflare Secret. Never put credentials or quotes in GitHub.
const BASE='https://api.fugle.tw/marketdata/v1.0/stock';
const ARCHIVE='https://raw.githubusercontent.com/hubert066/stock/main/data/reports/';
const OPEN='https://market-pulse-quotes.hubert066.workers.dev/quotes';
const SYMBOLS=['IX0001','2330','2454','2308','2317','2382','0050','0052','00662','00646'];
const HEAD={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin'};
const n=v=>Number.isFinite(v)?v:null;
const stamp=v=>Number.isFinite(v)&&v>0&&v/1000<8640000000000000?new Date(v/1000).toISOString():null;
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{...HEAD,'Content-Type':'application/json; charset=utf-8'}});
async function get(url,key){
 const r=await fetch(url,{headers:{Accept:'application/json',...(key?{'X-API-KEY':key}:{})},redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Object.assign(new Error('upstream'),{upstream:r.status});
 return r.json();
}
function quote(q,s){
 const value=n(q.lastPrice??q.closePrice);
 if(value===null||!day(q.date))throw Error('invalid quote');
 return {symbol:s,date:q.date,value,change:n(q.change),pct:n(q.changePercent),previous:n(q.previousClose),open:n(q.openPrice),high:n(q.highPrice),low:n(q.lowPrice),turnover:Number.isFinite(q.total?.tradeValue)?q.total.tradeValue/1e8:null,asof:stamp(q.isTrial?q.lastTrial?.time:q.lastTrade?.time??q.closeTime),updated:stamp(q.lastUpdated),fetched:new Date().toISOString(),closed:q.isClose===true,trial:q.isTrial===true};
}
const reportName=r=>r.session==='opening'?'早盤':r.session==='closing'?'收盤':'法人';
function reportMeta(r){return {date:r.date,session:r.session,status:r.status,generated_at:r.generated_at??null}}
function validReport(r){return r&&day(r.date)&&['opening','closing','institutional'].includes(r.session)}
const short=v=>typeof v==='string'?v.slice(0,1800):'';
export default {async fetch(req,env,ctx){
 if(!ctx.access)return json({status:'unauthorized'},403);
 if(req.method!=='GET')return json({status:'method_not_allowed'},405);
 if(req.headers.get('Sec-Fetch-Site')==='cross-site'&&new URL(req.url).pathname!=='/')return json({status:'cross_site_denied'},403);
 const u=new URL(req.url);
 if(u.pathname==='/')return new Response(PAGE,{headers:{...HEAD,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
 try{
  if(u.pathname==='/quotes'||u.pathname==='/api/quote'){
   const s=u.pathname==='/quotes'?'IX0001':u.searchParams.get('symbol');
   if(!SYMBOLS.includes(s))return json({status:'invalid_symbol'},400);
   if(!env.FUGLE_API_KEY)return json({status:'missing_secret'},503);
   const q=await get(BASE+'/intraday/quote/'+s,env.FUGLE_API_KEY);
   return json({status:'ok',...quote(q,s)});
  }
  if(u.pathname==='/api/candles'){
   if(!env.FUGLE_API_KEY)return json({status:'missing_secret'},503);
   const q=await get(BASE+'/intraday/candles/IX0001?timeframe=1&sort=asc',env.FUGLE_API_KEY);
   const points=(Array.isArray(q.data)?q.data:[]).filter(p=>typeof p.date==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(p.date)&&Number.isFinite(Date.parse(p.date))&&Number.isFinite(p.close)).map(p=>({time:p.date,value:p.close})).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-400);
   return json({status:'ok',date:day(q.date),points,fetched:new Date().toISOString()});
  }
  if(u.pathname==='/api/daily'){
   const d=await get(OPEN);
   if(d.status!=='ok'||d.mode!=='open_daily')return json({status:'daily_unavailable'},502);
   const q=d.quotes?.us10y;
   return json({status:'ok',us10y:q&&day(q.date)&&Number.isFinite(q.value)?{value:q.value,date:q.date,source:'U.S. Treasury · daily CMT'}:null});
  }
  if(u.pathname==='/api/reports'){
   const a=await get(ARCHIVE+'index.json');
   const reports=(Array.isArray(a)?a:[]).filter(validReport).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,90).map(reportMeta);
   const ok=reports.filter(r=>r.status==='ok');
   const dates=new Set(ok.filter(r=>r.session==='closing').map(r=>r.date));
   return json({status:'ok',reports,paired:ok.filter(r=>r.session==='opening'&&dates.has(r.date)).length});
  }
  if(u.pathname==='/api/report'){
   const date=u.searchParams.get('date'),session=u.searchParams.get('session');
   if(!validReport({date,session}))return json({status:'invalid_report'},400);
   const r=await get(ARCHIVE+date+'/'+session+'.json');
   if(r.date!==date||r.session!==session)return json({status:'invalid_report'},502);
   if(r.status!=='ok')return json({status:'unverified_report',note:short(r.note)},409);
   return json({status:'ok',date,session,generated_at:r.generated_at??null,headline:short(r.headline),summary:short(r.summary),thesis:short(r.thesis),note:short(r.note),factors:(Array.isArray(r.factors)?r.factors:[]).slice(0,8).map(f=>({title:short(f.title),text:short(f.text)})),scenarios:(Array.isArray(r.scenarios)?r.scenarios:[]).slice(0,6).map(f=>({title:short(f.title),threshold:short(f.threshold),text:short(f.text)}))});
  }
  return json({status:'not_found'},404);
 }catch(e){return json({status:e.upstream===429?'rate_limited':'source_unavailable',upstream_status:e.upstream??null},e.upstream===429?429:502)}
}};
const PAGE=`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Market Pulse 4.0 Private</title>
<style>
:root{--bg:#f5f4ef;--paper:#fff;--ink:#172635;--muted:#667785;--line:#d9dedf;--red:#b92332;--green:#087553;--gold:#a15b27}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 system-ui,"Microsoft JhengHei",sans-serif;font-variant-numeric:tabular-nums}header{background:var(--ink);color:white;padding:10px 0}header .wrap{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}.wrap{width:min(1200px,100%);margin:auto;padding:0 22px}main{padding-bottom:40px!important}h1,h2,h3,p{margin:0}h1{font:700 clamp(29px,5vw,44px) Georgia,serif;letter-spacing:-1px}h2{font:700 22px Georgia,"Microsoft JhengHei",serif;margin-bottom:12px}h3{font-size:14px}.intro{padding:24px 0 15px;border-bottom:2px solid var(--ink);display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}.muted,small{color:var(--muted)}.eyebrow{font-size:11px;letter-spacing:1.5px;font-weight:700;color:var(--gold)}.nav{display:flex;flex-wrap:wrap;gap:12px;padding:12px 0}.nav a,a{color:inherit;text-decoration:underline;text-underline-offset:3px}.nav a{font-weight:650}.layout{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-top:8px}.panel{background:var(--paper);border:1px solid var(--line);padding:20px;margin-bottom:16px;min-width:0;border-radius:5px}.layout>.panel{margin-bottom:0}.price{font-size:clamp(36px,7vw,62px);line-height:1.12;font-weight:750;letter-spacing:-1.5px}.delta{font-size:20px;font-weight:700}.up{color:var(--red)}.down{color:var(--green)}.flat{color:var(--muted)}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.metrics div{border-top:1px solid var(--line);padding-top:8px}.metrics strong{display:block;font-size:18px;overflow-wrap:anywhere}.status{font-size:12px;color:var(--muted);margin:8px 0}.times{font-size:12px;color:var(--muted);display:grid;gap:3px}.btn{border:1px solid var(--line);padding:8px 12px;background:white;color:var(--ink);border-radius:4px;font:inherit;cursor:pointer}.btn:hover{border-color:var(--ink)}.primary{background:var(--ink);color:white}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.chart{width:100%;height:240px;display:block}.watch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.stock{border:1px solid var(--line);padding:12px;border-radius:4px;min-width:0}.stock strong{display:block;font-size:23px;letter-spacing:-.5px}.stock .sub{font-size:11px;color:var(--muted);overflow-wrap:anywhere}.stock .move{font-weight:650}.section{margin-top:20px}.sectionhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}.rule{padding:10px 0;border-bottom:1px solid var(--line)}.rule:last-child{border:0}.warn{color:var(--gold);font-weight:650}.links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.links a{padding:9px;border:1px solid var(--line);border-radius:4px;text-decoration:none}.links a:hover{border-color:var(--ink)}.reports{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.reporttext{white-space:pre-wrap;overflow-wrap:anywhere}.note{font-size:12px;color:var(--muted);margin-top:8px}.pill{font-size:11px;letter-spacing:.4px;border:1px solid #a6b6c0;padding:3px 7px;border-radius:4px}footer{border-top:1px solid var(--line);padding:18px 0;font-size:12px;color:var(--muted)}@media(max-width:780px){.layout{grid-template-columns:1fr}.wrap{padding:0 12px}.panel{padding:15px}.watch{grid-template-columns:repeat(2,minmax(0,1fr))}.links{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.chart{height:210px}}
</style></head><body>
<header><div class="wrap"><span>MARKET PULSE / PRIVATE RESEARCH</span><span id="clock">台北時間 —</span></div></header>
<main class="wrap"><div class="intro"><div><div class="eyebrow">TAIWAN & GLOBAL MARKET INTELLIGENCE</div><h1>Market Pulse 4.0</h1><p class="muted">Fugle 行情 · 個人專屬研究儀表板</p></div><span class="pill">ACCESS PROTECTED · FREE EDITION</span></div>
<nav class="nav"><a href="#market">台股大盤</a><a href="#watch">權值股與ETF</a><a href="#risk">風險監測</a><a href="#global">國際市場</a><a href="#reports">市場報告</a></nav>
<div class="layout" id="market"><section class="panel"><div class="eyebrow">TAIEX / IX0001</div><div class="price" id="price">—</div><div class="delta" id="delta">—</div><div id="marketstatus" class="status" role="status">等待行情</div>
<div class="metrics"><div><small>開盤</small><strong id="open">—</strong></div><div><small>昨日收盤</small><strong id="previous">—</strong></div><div><small>最高</small><strong id="high">—</strong></div><div><small>最低</small><strong id="low">—</strong></div><div><small>成交金額（億）</small><strong id="turnover">—</strong></div><div><small>來源資料經過時間</small><strong id="age">—</strong></div></div>
<div class="times"><span id="tradeTime">成交／指數時間：—</span><span id="sourceTime">來源更新：—</span><span id="fetchTime">API 擷取：—</span></div><div class="toolbar"><button class="btn primary" id="refresh">立即更新大盤</button><button class="btn" id="pause">暫停查詢</button><small id="pollState">一般交易時段5秒查詢</small></div></section>
<section class="panel"><h2>當日分時走勢</h2><div class="status" id="chartstatus">等待 Fugle 1分K</div><canvas id="chart" class="chart" role="img" aria-label="當日指數分時走勢"></canvas><p class="note">1分K 每60秒回補，另接入已取得的最新指數；不補造缺失點位。橫軸固定09:00–13:30。</p></section></div>
<section class="panel section" id="watch"><div class="sectionhead"><h2>權值股與 ETF</h2><small>台積電10秒／其餘30秒（盤中目標）</small></div><div class="watch" id="watchlist"></div><p class="note">每張卡片獨立顯示來源時間；更新失敗時保留上次數值並標註。ETF 僅顯示台灣上市交易價格，非海外標的即時淨值。</p></section>
<section class="panel section" id="risk"><h2>市場風險監測</h2><div id="rules" role="status">等待有效資料</div><p class="note">本地規則，不是生成式 AI 或預測模型。僅在今日非試撮資料有效時評估；盤中過舊資料暫停判讀。個人行情不傳入外部 AI 服務。</p></section>
<section class="panel section" id="global"><h2>國際市場與新聞</h2><div class="rule"><small>美國10年期公債殖利率 · 官方每日 CMT</small><div class="delta" id="yield">—</div><small id="yielddate">等待官方資料</small></div><p class="note">以下為外部官方行情／新聞查詢入口，不是本站已串接的即時 API；期貨及美股延遲依來源。</p><div class="links" style="margin-top:10px"><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/SP-SPX/">S&amp;P 500</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/NASDAQ-IXIC/">NASDAQ</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/DJ-DJI/">Dow Jones</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/TVC-SOX/">費半 SOX</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/CBOE-VIX/">VIX</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/CME_MINI-ES1!/">S&amp;P 期貨</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/CME_MINI-NQ1!/">Nasdaq 期貨</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/FX_IDC-USDTWD/">USD/TWD</a><a target="_blank" rel="noopener noreferrer" href="https://www.tradingview.com/symbols/AMEX-VOO/">VOO</a><a target="_blank" rel="noopener noreferrer" href="https://www.cnyes.com/">鉅亨網</a><a target="_blank" rel="noopener noreferrer" href="https://news.google.com/?hl=zh-TW&gl=TW&ceid=TW:zh-Hant">Google 新聞</a><a target="_blank" rel="noopener noreferrer" href="https://hubert066.github.io/stock/">原公開市場總覽</a></div></section>
<section class="panel section" id="reports"><h2>早盤／收盤歷史報告</h2><div id="archiveStatus" class="status">等待 GitHub 報告索引</div><div class="reports" id="reportButtons"></div><div id="reportBody" class="reporttext muted">僅載入狀態為 ok 的既有報告；試跑及未確認報告不作正式分析。尚無生成式 AI。</div><p class="note">沿用既有09:15、13:40排程；實際報告以索引為準。配對數僅表示資料可用性，不是命中率。</p></section>
<footer>Fugle · 個人行情，禁止公開轉播。台股查詢為一般交易時段目標；非盤中降頻。行情不寫入公開 GitHub、不使用外部分析腳本。<br>國際官方日資料：美國財政部。<a href="/cdn-cgi/access/logout">登出</a></footer></main>
<script>
'use strict';
const $=id=>document.getElementById(id), num=v=>Number.isFinite(v), fmt=(v,d=2)=>num(v)?v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d}):'—', signed=v=>num(v)?(v>0?'+':'')+fmt(v):'—', dir=v=>v>0?'up':v<0?'down':'flat';
const TZ='Asia/Taipei', taipei=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}), clock=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const parts=t=>Object.fromEntries(clock.formatToParts(new Date(t)).map(p=>[p.type,p.value]));
const date=t=>taipei.format(new Date(t));const local=t=>t&&Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('zh-TW',{timeZone:TZ,hour12:false}):'—';
function session(){const p=parts(Date.now()),m=+p.hour*60+(+p.minute);return !['Sat','Sun'].includes(p.weekday)&&m>=540&&m<810}
const list=[['2330','台積電'],['2454','聯發科'],['2308','台達電'],['2317','鴻海'],['2382','廣達'],['0050','元大台灣50'],['0052','富邦科技'],['00662','富邦NASDAQ'],['00646','元大S&P500']];
function text(tag,value,klass){const e=document.createElement(tag);e.textContent=value;if(klass)e.className=klass;return e}
const cards=new Map(),quotes=new Map(),failed=new Set();let candleData=[],candleDate=null,livePoints=[],chartFailed=false,paused=false,cooldown=0,active=0,archiveLoaded=false;
for(const [s,name] of list){const c=text('div','','stock'),p=text('strong','—'),m=text('div','—','move'),t=text('div','等待行情','sub');c.append(text('small',s+' '+name),p,m,t);$('watchlist').append(c);cards.set(s,{p,m,t})}
function marketAge(q){const t=Date.parse(q?.updated||q?.asof||'');return Number.isFinite(t)?Math.floor((Date.now()-t)/1000):null}
function latestValid(q){const age=marketAge(q);return q&&q.date===date(Date.now())&&!q.trial&&!failed.has('IX0001')&&(session()?(!q.closed&&age!==null&&age>=-5&&age<=60):q.closed)}
function rules(){const q=quotes.get('IX0001'),r=$('rules');r.replaceChildren();if(!latestValid(q)){r.append(text('div','暫停判讀：行情缺值、非今日、試撮或盤中資料過舊。','rule warn'));return}
 const arr=[];if(num(q.change)&&q.change<=-800)arr.push(['下跌達800點：注意快速回撤。','warn']);if(num(q.pct)&&Math.abs(q.pct)>=3)arr.push(['單日波動達3%：高波動觀察。','warn']);if(num(q.pct))arr.push(['大盤漲跌幅 '+signed(q.pct)+'%。','']);if(num(q.high)&&num(q.low)&&num(q.previous)&&q.previous>0)arr.push(['日內高低振幅 '+fmt(100*(q.high-q.low)/q.previous)+'%。','']);
 const qs=list.map(([s])=>quotes.get(s)).filter(v=>v&&v.date===q.date&&!v.trial&&num(v.pct)&&!failed.has(v.symbol)&&(session()?(!v.closed&&marketAge(v)!==null&&marketAge(v)>=-5&&marketAge(v)<=90):v.closed));if(qs.length)arr.push(['自選 '+qs.length+' 檔有效行情：'+qs.filter(v=>v.pct>0).length+' 漲、'+qs.filter(v=>v.pct<0).length+' 跌、'+qs.filter(v=>v.pct===0).length+' 平（非全市場廣度）。','']);
 for(const [s,c] of arr)r.append(text('div',s,'rule '+c));if(!arr.length)r.append(text('div','未取得足夠指標。','rule'))}
function drawQuote(q){const old=quotes.get(q.symbol);quotes.set(q.symbol,q);failed.delete(q.symbol);if(q.symbol==='IX0001'){
 $('price').textContent=fmt(q.value);$('delta').textContent=signed(q.change)+' / '+(num(q.pct)?signed(q.pct)+'%':'—');$('delta').className='delta '+dir(q.change);
 for(const k of ['open','previous','high','low','turnover'])$(k).textContent=fmt(q[k]);
 $('tradeTime').textContent='成交／指數時間：'+local(q.asof);$('sourceTime').textContent='來源更新：'+local(q.updated);$('fetchTime').textContent='API 擷取：'+local(q.fetched);
 if(!old||old.date!==q.date)livePoints=[];
 if(q.asof&&!q.trial&&Number.isFinite(Date.parse(q.asof))&&date(Date.parse(q.asof))===q.date){const p={time:q.asof,value:q.value};if(!livePoints.some(x=>x.time===p.time))livePoints.push(p);livePoints=livePoints.slice(-400)}drawChart();
 }else{const c=cards.get(q.symbol);if(c){c.p.textContent=fmt(q.value);c.m.textContent=num(q.pct)?signed(q.pct)+'%':'—';c.m.className='move '+dir(q.pct);c.t.textContent=(q.closed?'收盤 · ':q.trial?'試撮 · ':'')+local(q.asof||q.updated)}}tick();rules()}
function tick(){const now=Date.now(),q=quotes.get('IX0001');$('clock').textContent='台北 '+new Date(now).toLocaleString('zh-TW',{timeZone:TZ,hour12:false});
 if(q){const age=marketAge(q);$('age').textContent=q.closed?'已收盤':session()&&age!==null&&age>=0?age+' 秒':'非盤中／待確認';$('marketstatus').textContent=q.date+' · '+(failed.has('IX0001')?'上次取得／更新失敗':q.date!==date(now)?'非今日行情':q.trial?'試撮':q.closed?'已收盤':session()?(age!==null&&age>=-5&&age<=60?'盤中資料':'資料過舊／待確認'):'非一般交易時段')}
 $('pollState').textContent=paused?'已暫停':document.hidden?'背景分頁暫停':Date.now()<cooldown?'限流冷卻 '+Math.ceil((cooldown-now)/1000)+'秒':session()?'盤中查詢目標5秒':'非盤中大盤60秒';
}
function drawChart(){const cv=$('chart'),rect=cv.getBoundingClientRect(),w=Math.max(200,rect.width),h=Math.max(150,rect.height),dpr=Math.min(2,devicePixelRatio||1);cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);const q=quotes.get('IX0001'),d=q?.date||candleDate,merged=new Map();
 for(const p of [...candleData,...livePoints]){const t=Date.parse(p.time);if(!Number.isFinite(t)||!num(p.value)||date(t)!==d)continue;const v=parts(t),m=+v.hour*60+(+v.minute)+(+v.second)/60;if(m>=540&&m<=810)merged.set(t,{m,value:p.value})}
 const points=[...merged.values()].sort((a,b)=>a.m-b.m),l=58,r=w-12,top=15,b=h-29;
 if(!points.length){c.fillStyle='#667785';c.font='12px sans-serif';c.fillText('尚無當日有效分時資料',12,h/2);$('chartstatus').textContent=chartFailed?'1分K取得失敗，等待有效報價':'尚無有效分時資料';return}
 const vals=points.map(p=>p.value);if(num(q?.previous))vals.push(q.previous);let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){lo-=1;hi+=1}const pad=(hi-lo)*.07;lo-=pad;hi+=pad;const x=m=>l+(m-540)/270*(r-l),y=v=>top+(hi-v)/(hi-lo)*(b-top);
 c.font='10px sans-serif';for(let i=0;i<5;i++){const yy=top+(b-top)*i/4;c.strokeStyle='#e2e5e4';c.beginPath();c.moveTo(l,yy);c.lineTo(r,yy);c.stroke();c.fillStyle='#667785';c.textAlign='right';c.fillText(fmt(hi-(hi-lo)*i/4,0),l-5,yy+3)}
 for(const m of [540,600,660,720,810]){c.textAlign='center';c.fillText(String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),x(m),h-8)}
 if(num(q?.previous)){c.strokeStyle='#8998a3';c.setLineDash([4,3]);c.beginPath();c.moveTo(l,y(q.previous));c.lineTo(r,y(q.previous));c.stroke();c.setLineDash([])}
 c.strokeStyle=q?.change<0?'#087553':'#b92332';c.fillStyle=c.strokeStyle;c.lineWidth=1.7;c.beginPath();for(let i=0;i<points.length;i++){const p=points[i];if(i===0||p.m-points[i-1].m>2)c.moveTo(x(p.m),y(p.value));else c.lineTo(x(p.m),y(p.value))}c.stroke();const last=points.at(-1);c.beginPath();c.arc(x(last.m),y(last.value),3,0,Math.PI*2);c.fill();
 $('chartstatus').textContent=d+' · '+points.length+' 筆有效點位'+(chartFailed?' · 1分K更新失敗':'')}
async function api(path){const r=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(r.status===429){cooldown=Date.now()+65000;throw Error('429 限流')}if(!r.ok)throw Error('HTTP '+r.status);const q=await r.json();if(q.status!=='ok')throw Error(q.status);return q}
const tasks=[{id:'IX0001',ms:5000,off:60000,run:()=>api('/quotes').then(drawQuote)},{id:'2330',ms:10000,off:300000,run:()=>api('/api/quote?symbol=2330').then(drawQuote)},...list.slice(1).map(([s])=>({id:s,ms:30000,off:300000,run:()=>api('/api/quote?symbol='+s).then(drawQuote)})),{id:'candles',ms:60000,off:300000,run:async()=>{const q=await api('/api/candles');candleData=q.points||[];candleDate=q.date;chartFailed=false;drawChart()}},{id:'daily',ms:300000,off:300000,run:async()=>{const d=await api('/api/daily');$('yield').textContent=d.us10y?fmt(d.us10y.value)+'%':'—';$('yielddate').textContent=d.us10y?d.us10y.date+' · '+d.us10y.source:'尚未取得官方資料'}},{id:'archive',ms:300000,off:300000,run:loadReports}];
tasks.forEach((t,i)=>{t.due=Date.now()+i*300;t.busy=false});
function taskFail(t,e){if(t.id==='IX0001'||cards.has(t.id)){failed.add(t.id);if(cards.has(t.id))cards.get(t.id).t.textContent=(quotes.has(t.id)?'上次資料 · '+local(quotes.get(t.id).asof||quotes.get(t.id).updated)+' · ':'')+'更新失敗 '+e.message;else if(!quotes.has(t.id))$('marketstatus').textContent='行情取得失敗 '+e.message;rules();tick()}else if(t.id==='candles'){chartFailed=true;drawChart()}else if(t.id==='archive')$('archiveStatus').textContent='報告索引更新失敗 '+e.message;else $('yielddate').textContent='官方資料更新失敗'+( $('yield').textContent!=='—'?' · 保留上次值':'')}
function schedule(){if(paused||document.hidden||Date.now()<cooldown)return;const now=Date.now();for(const t of tasks){if(active>=3)break;if(t.busy||t.due>now)continue;t.busy=true;active++;t.due=now+(session()?t.ms:t.off);Promise.resolve().then(t.run).catch(e=>taskFail(t,e)).finally(()=>{t.busy=false;active--;if(t.due<Date.now())t.due=Date.now()+1000})}}
async function loadReports(){const d=await api('/api/reports'),a=d.reports||[],ok=a.filter(r=>r.status==='ok');$('archiveStatus').textContent='正式報告 '+ok.length+' 筆 · 試跑／非正式 '+(a.length-ok.length)+' 筆 · 早收盤配對 '+d.paired+' 日';const b=$('reportButtons');b.replaceChildren();for(const r of ok.slice(0,20)){const btn=text('button',r.date+' '+(r.session==='opening'?'早盤':r.session==='closing'?'收盤':'法人'),'btn');btn.onclick=()=>loadReport(r);b.append(btn)}if(!ok.length){$('reportBody').textContent='目前索引沒有正式報告；保留排程，等待實際產出。';archiveLoaded=false}else if(!archiveLoaded){archiveLoaded=true;await loadReport(ok[0])}}
async function loadReport(r){const box=$('reportBody');try{const q=await api('/api/report?date='+encodeURIComponent(r.date)+'&session='+encodeURIComponent(r.session));box.replaceChildren(text('small',q.date+' · '+(q.generated_at?local(q.generated_at):'產製時間未提供')),text('h3',q.headline||'市場報告'),text('p',q.summary||'摘要未提供'),text('p',q.thesis||''));for(const f of [...q.factors,...q.scenarios])box.append(text('div',[f.title,f.threshold,f.text].filter(Boolean).join('：'),'rule'));if(q.note)box.append(text('p',q.note,'note'))}catch(e){box.textContent='報告載入失敗：'+e.message}}
$('refresh').onclick=()=>{const t=tasks[0];if(!paused&&Date.now()>=cooldown&&!t.busy){t.due=Math.min(t.due,Date.now()+1000);schedule()}};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'恢復查詢':'暫停查詢';tick();if(!paused)schedule()};
document.addEventListener('visibilitychange',()=>{tick();if(!document.hidden)schedule()});window.addEventListener('resize',drawChart);setInterval(()=>{tick();schedule()},1000);setInterval(rules,5000);tick();schedule();drawChart();
</script></body></html>`;
