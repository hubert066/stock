(()=>{'use strict';
const el=id=>document.getElementById(id), fmt=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const zone='Asia/Taipei', local=t=>new Intl.DateTimeFormat('zh-TW',{timeZone:zone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(t));
const date=t=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const names={taiex:'台灣加權指數',tsmc:'台積電 2330',turnover:'累計成交金額',advancers:'上漲家數',decliners:'下跌家數',es:'S&P 500 期貨',nq:'Nasdaq 100 期貨',tx:'台指期',sp500:'S&P 500',nasdaq:'NASDAQ',dow:'Dow Jones',russell:'Russell 2000',sox:'費半 SOX',vix:'VIX',usd_twd:'USD/TWD',us10y:'美債 10Y'};
let config=null,busy=false,last=null,points=[],timer=null,refreshSeconds=60;
const good=q=>q&&typeof q.value==='number'&&Number.isFinite(q.value)&&Number.isFinite(Date.parse(q.asof));
function status(s){el('mp-live-status').textContent=s}
function text(tag,s,klass){const e=document.createElement(tag);e.textContent=s;if(klass)e.className=klass;return e}
function currentSession(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts().map(p=>[p.type,p.value]));const m=Number(p.hour)*60+Number(p.minute);return !['Sat','Sun'].includes(p.weekday)&&m>=540&&m<810}
function drawDaily(data){
 const box=el('mp-live-quotes');box.replaceChildren();
 const quotes=data.quotes||{}, list=[...Object.entries(quotes).map(([k,q])=>[names[k]||k,q]),...(data.watchlist||[]).filter(q=>q.symbol!=='2330.TW').map(q=>[q.name+' '+q.symbol,q])];
 for(const [name,q] of list){if(!Number.isFinite(q.value)||!/^\d{4}-\d{2}-\d{2}$/.test(q.date||''))continue;const card=text('div','','mp-quote');card.append(text('small',name),text('strong',fmt(q.value,q.unit==='%'?3:2)+(q.unit?' '+q.unit:'')),text('span',Number.isFinite(q.pct)?(q.pct>0?'+':'')+fmt(q.pct)+'%':'—',q.pct>0?'up':q.pct<0?'down':'muted'),text('small',q.date+' · '+q.source));box.append(card)}
 status('官方盤後資料 · '+(quotes.taiex?.date||'指數未取得')+' ｜ 最近擷取 '+local(data.generated_at)+' ｜ 每 '+refreshSeconds+' 秒檢查（資料本身每日公布）');
 el('mp-live-chart').replaceChildren(text('p','免費開放資料不含盤中分時報價，請使用下方 TradingView 官方行情元件。','muted'));
 const sig=[];const q=quotes.taiex;if(Number.isFinite(q?.pct))sig.push(q.date+' 收盤漲跌 '+fmt(q.pct)+'%，'+(Math.abs(q.pct)>=3?'屬高波動觀察門檻。':'未達 3% 高波動門檻。'));
 if(Number.isFinite(q?.change)&&q.change<=-800)sig.push('該交易日收盤下跌達 800 點。');
 el('mp-live-signals').replaceChildren(...(sig.length?sig.map(x=>text('p',x)):[text('p','尚無可用盤後指標。')]));
 el('mp-live-note').replaceChildren(text('p','盤後規則式觀察，非盤中訊號。資料提供：臺灣證券交易所／金管會證期局、美國財政部。'),text('p',(data.warnings||[]).join('；')));
 const a=document.createElement('a');a.href='https://data.gov.tw/license';a.textContent='政府資料開放授權條款－第1版';a.target='_blank';a.rel='noopener';el('mp-live-note').append(a);
}
function draw(data){if(data.mode==='open_daily'){drawDaily(data);return}const q=data.quotes||{}, box=el('mp-live-quotes');box.replaceChildren();for(const [k,name] of Object.entries(names)){const v=q[k],card=text('div','','mp-quote');card.append(text('small',name),text('strong',good(v)?fmt(v.value,['advancers','decliners'].includes(k)?0:k==='usd_twd'||k==='us10y'?3:2)+(v.unit?' '+v.unit:''):'—'));card.append(text('span',good(v)&&Number.isFinite(v.pct)?(v.pct>0?'+':'')+fmt(v.pct)+'%':'—',v?.pct>0?'up':v?.pct<0?'down':'muted'));card.append(text('small',good(v)?local(v.asof)+' · '+v.source+(Number.isFinite(v.delay_minutes)?' · 延遲 '+v.delay_minutes+' 分':' · 延遲未確認'):'未取得'));box.append(card)}
 const now=Date.now(),today=date(now),fresh=good(q.taiex)&&date(q.taiex.asof)===today&&now-Date.parse(q.taiex.asof)<=180000&&Date.parse(q.taiex.asof)<=now+60000;
 status((currentSession()?(fresh?'盤中報價已取得':'台股盤中 · 報價延遲或缺值'):'非台股一般交易時段')+' ｜ '+(good(q.taiex)?'指數時間 '+local(q.taiex.asof):'未取得指數')+' ｜ 每 '+refreshSeconds+' 秒檢查');
 points=(data.points||[]).filter(p=>Number.isFinite(p.value)&&Number.isFinite(Date.parse(p.asof))&&date(p.asof)===today);
 if(good(q.taiex)&&date(q.taiex.asof)===today)points.push({asof:q.taiex.asof,value:q.taiex.value});
 const map=new Map(points.map(p=>[p.asof,p]));points=[...map.values()].sort((a,b)=>Date.parse(a.asof)-Date.parse(b.asof));drawChart();
 const signals=[];if(fresh&&Number.isFinite(q.taiex.pct)){if(Math.abs(q.taiex.pct)>=3)signals.push('加權指數單日波動達 3%：留意高波動風險。');else signals.push('加權指數當日變動 '+fmt(q.taiex.pct)+'%。')}
 if(fresh&&Number.isFinite(q.taiex.change)&&q.taiex.change<=-800)signals.push('加權指數下跌達 800 點。');
 const sameDay=v=>good(v)&&date(v.asof)===today&&now-Date.parse(v.asof)<=180000;
 if(sameDay(q.advancers)&&sameDay(q.decliners)){const a=q.advancers.value,b=q.decliners.value;if(a+b>0)signals.push('上漲家數占比 '+fmt(100*a/(a+b),1)+'%（不含平盤）。')}
 if(good(q.vix)&&now-Date.parse(q.vix.asof)<=86400000&&q.vix.value>=25)signals.push('VIX ≥ 25，注意避險情緒（依其報價時間）。');
 el('mp-live-signals').replaceChildren(...(signals.length?signals.map(s=>text('p',s)): [text('p','尚無足夠新鮮行情可產生盤中風險訊號。')]));
 el('mp-live-note').textContent='規則式監測，非生成式 AI、非投資建議。交易時段依一般市場時間，休市及來源延遲以實際行情時間為準。';
}
function drawChart(){const box=el('mp-live-chart');box.replaceChildren();if(points.length<2){box.append(text('p','尚無足夠當日分時資料。','muted'));return}
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 180');svg.setAttribute('role','img');svg.setAttribute('aria-label','當日台股分時走勢');const values=points.map(p=>p.value),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1,t0=Date.parse(points[0].asof),t1=Date.parse(points.at(-1).asof),x=p=>50+(Date.parse(p.asof)-t0)/Math.max(1,t1-t0)*530,y=v=>12+(hi-v)/span*130;
 const make=(tag,attrs,content)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(content)e.textContent=content;svg.append(e);return e};
 for(let i=0;i<5;i++){const yy=12+i*32.5;make('line',{x1:50,x2:580,y1:yy,y2:yy,stroke:'currentColor',opacity:'.12'});make('text',{x:45,y:yy+4,'text-anchor':'end',fill:'currentColor','font-size':10},fmt(hi-i*span/4,0))}
 make('polyline',{points:points.map(p=>x(p)+','+y(p.value)).join(' '),fill:'none',stroke:'#087553','stroke-width':2});make('text',{x:50,y:168,fill:'currentColor','font-size':10},local(t0));make('text',{x:580,y:168,'text-anchor':'end',fill:'currentColor','font-size':10},local(t1));box.append(svg)}
async function refresh(){if(busy||document.hidden)return;busy=true;try{if(!config){const r=await fetch('data/live-config.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('config');config=await r.json();refreshSeconds=Math.max(60,Math.min(300,Number(config.refresh_seconds)||60))}
 if(!config.enabled||!config.endpoint){status('即時服務尚未啟用 · 保留定時市場報告');return}
 const u=new URL(config.endpoint);if(u.protocol!=='https:')throw Error('endpoint');const r=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('provider');const data=await r.json();if(data.status!=='ok'||!Object.values(data.quotes||{}).some(q=>data.mode==='open_daily'?Number.isFinite(q?.value)&&!!q.date:good(q)))throw Error('invalid');last=data;draw(data);
 }catch(e){status('行情來源未連線'+(last?' · 保留上次報價 '+local(last.generated_at):' · 請參考定時市場報告'));el('mp-live-signals').replaceChildren(text('p','連線失敗，暫停盤中風險判斷。'));}finally{busy=false;clearTimeout(timer);timer=setTimeout(refresh,refreshSeconds*1000)}}
function reportStats(){const box=el('mp-validation-stats');if(!box)return;fetch('data/reports/index.json?t='+Date.now()).then(r=>r.ok?r.json():[]).then(async a=>{const list=(Array.isArray(a)?a:[]).filter(x=>x.session==='closing'&&x.status==='ok'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((x,y)=>y.date.localeCompare(x.date)).slice(0,60);const results=await Promise.all(list.map(async x=>{try{const [o,c]=await Promise.all(['opening','closing'].map(s=>fetch('data/reports/'+x.date+'/'+s+'.json').then(r=>r.ok?r.json():null)));if(o?.status!=='ok'||c?.status!=='ok'||!Number.isFinite(o.prices?.taiex?.value)||!Number.isFinite(c.prices?.taiex?.value))return null;return {date:x.date,scenario:c.validation?.scenario||'未分類',delta:c.prices.taiex.value-o.prices.taiex.value}}catch{return null}}));const valid=results.filter(Boolean);box.replaceChildren(text('p','最近 60 期收盤報告中，具有效早盤／收盤配對：'+valid.length+' 期（試跑排除）。'));for(const k of ['A','B','C'])box.append(text('p','情境 '+k+'：'+valid.filter(r=>r.scenario===k).length+' 期'));box.append(text('p','情境分布並非預測勝率；未指定機率或唯一預測時，不計算命中率。','muted'))}).catch(()=>{box.textContent='暫無可驗證的歷史配對資料。'})}
el('mp-live-refresh').onclick=()=>{config=null;refresh()};document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});refresh();reportStats();
})();