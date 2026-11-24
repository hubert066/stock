#!/usr/bin/env python3
"""Build immutable, date-scoped Market Pulse reports. No invented quotes."""
import json, sys, math
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo
import yfinance as yf
import update_market as base

TZ=ZoneInfo("Asia/Taipei")
NOW=datetime.now(TZ)
DAY=NOW.date().isoformat()
ROOT=base.DATA/"reports"
SECTORS={"XLK":"科技","XLY":"非必需消費","XLI":"工業","XLC":"通訊服務","XLB":"原物料","XLF":"金融","XLU":"公用事業","XLV":"醫療保健","XLRE":"房地產","XLP":"必需消費","XLE":"能源"}
WATCH={**base.WATCH,"2382.TW":"廣達","TSLA":"Tesla","META":"Meta","GOOGL":"Alphabet","AAPL":"Apple","CRWD":"CrowdStrike"}

def load(path,default):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (OSError,ValueError):return default

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    tmp.replace(path)

def intraday(symbol,name,previous=None):
    try:
        df=yf.Ticker(symbol).history(period="5d",interval="1m",auto_adjust=False,actions=False).dropna(subset=["Close"])
        if df.empty or df.index.tz is None:return None
        df=df.tz_convert(TZ)
        cutoff=NOW.replace(hour=9,minute=15,second=0,microsecond=0)
        bars=df[(df.index.date==NOW.date()) & (df.index.hour>=9) & (df.index+timedelta(minutes=1)<=min(NOW,cutoff))]
        if bars.empty:return None
        value=base.numeric(bars.iloc[-1]["Close"])
        if not value:return None
        if previous is None:
            older=df[df.index.date<NOW.date()]
            if len(older):previous=base.numeric(older.iloc[-1]["Close"])
        return {"name":name,"symbol":symbol,"value":value,"change":round(value-previous,4) if previous else None,
                "pct":round(100*(value/previous-1),3) if previous else None,"date":DAY,
                "asof":(bars.index[-1]+timedelta(minutes=1)).strftime("%H:%M")+" 台北，1分鐘K線結束",
                "source":"Yahoo Finance 盤中1分鐘K線（非官方、可能延遲）",
                "url":"https://finance.yahoo.com/quote/"+quote(symbol,safe="")}
    except Exception as e:
        base.LOG.warning("Intraday unavailable %s: %s",symbol,e)
        return None

def recent(symbol,name):
    q=base.yahoo(symbol,name,retries=1)
    if not q:return None
    try:
        age=(NOW.date()-datetime.fromisoformat(q["date"]).date()).days
        if age<0 or age>5:return None
    except (ValueError,TypeError,KeyError):return None
    q["asof"]="來源交易日報價（非即時）"
    return q

def scenario_for(q):
    v=q["value"]
    hi=round(v*1.005,2); lo=round(v*.995,2)
    return [{"id":"A","title":"早盤動能延續","threshold":f"收盤 ≥ {hi:,.2f}","text":"高於早盤基準0.5%；觀察權值股與市場廣度。","lower":hi},
            {"id":"B","title":"區間震盪","threshold":f"{lo:,.2f} ≤ 收盤 < {hi:,.2f}","text":"早盤基準上下0.5%內；觀察成交量。","lower":lo,"upper":hi},
            {"id":"C","title":"早盤動能走弱","threshold":f"收盤 < {lo:,.2f}","text":"低於早盤基準0.5%；觀察賣壓。","upper":lo}]

def run(session):
    if NOW.weekday()>=5:return 0
    path=ROOT/DAY/(session+".json")
    if path.exists():return 0
    official=base.twse()
    if session=="opening":
        if NOW.hour<9 or NOW.hour>=13:return 0
        if not official or official.get("date","")>=DAY:return 0
        tw=intraday("^TWII","TAIEX 加權指數",official["value"])
    elif session=="closing":
        if (NOW.hour,NOW.minute)<(13,30):return 0
        tw=official if official and official.get("date")==DAY else None
        if tw:tw["asof"]="官方日收盤"
    else:return 0
    if not tw or tw.get("date")!=DAY:
        base.LOG.warning("No matching Taiwan session data; no report published (holiday, delay or missing source).")
        return 0
    p={"taiex":tw}
    for k,(sym,name) in base.INDICES.items():
        q=recent(sym,name)
        if q:p[k]=q
    watch=[]
    for sym,name in WATCH.items():
        q=intraday(sym,name) if session=="opening" and sym.endswith(".TW") else recent(sym,name)
        if q:
            if sym.endswith(".TW") and q["date"]!=DAY:continue
            watch.append(q)
    tsmc=next((q for q in watch if q["symbol"]=="2330.TW"),None)
    if tsmc:p["tsmc"]=tsmc
    sectors=[]
    for sym,name in SECTORS.items():
        q=recent(sym,name)
        if q and q["date"]==p.get("sp500",{}).get("date") and q.get("pct") is not None:
            sectors.append({"name":name,"pct":q["pct"]})
    sectors.sort(key=lambda q:q["pct"],reverse=True)
    r=base.risk(p)
    change=tw.get("pct")
    direction="上漲" if change is not None and change>0 else "下跌" if change is not None and change<0 else "持平／未取得變動"
    phase="早盤" if session=="opening" else "收盤"
    headline=f"台股{phase}｜{direction}，留意科技股與風險訊號"
    summary=f"台股{phase}指數 {tw['value']:,.2f}；"+(f"相較前收 {change:+.2f}%。" if change is not None else "前收變動未取得。")
    summary+=" 下方新聞為Google News RSS原始標題，內容未獨立查核。"
    factors=[]
    for key,title,comment in [("sox","半導體動能","觀察台股科技族群是否同步。"),("vix","避險情緒","波動升高不必然預示下跌。"),("us10y","美債利率","殖利率上升可能對長久期估值施壓。"),("usd_twd","匯率訊號","匯率變動不等同外資實際買賣超。")]:
        q=p.get(key)
        if q:factors.append({"title":title,"text":f"{q['name']} {q['value']:,.3f}（{q['date']}）。"+comment})
    thesis="規則式市場觀察：短線漲跌與中期趨勢需分開判斷。"
    opening=load(ROOT/DAY/"opening.json",{})
    validation={}
    if session=="closing":
        sc=opening.get("scenarios",[])
        if opening.get("status")=="ok" and sc and all("lower" in s or "upper" in s for s in sc):
            hit=next((s for s in sc if tw["value"]>=s.get("lower",-math.inf) and tw["value"]<s.get("upper",math.inf)),None)
            validation={"scenario":hit["id"] if hit else "未分類","text":"依原始早盤固定門檻歸類；非方向預測命中率。"}
        elif opening.get("status")=="demo":
            validation={"scenario":"試跑未納入正式統計","text":"早盤為未重新核實的回溯原型，不計入正式驗證。"}
        else:validation={"scenario":"缺少早盤報告","text":"無法驗證，未回填早盤假設。"}
    record={"date":DAY,"session":session,"status":"ok","generated_at":datetime.now(TZ).isoformat(),
            "note":"規則式快報，非AI生成或回測模型。各市場來源日期不同；台股早盤採09:15前最後可用1分鐘K線，收盤採證交所官方資料。未取得的數值不補造。",
            "prices":p,"watchlist":watch,"news":base.news(),"sectors":sectors,"risk":r,"headline":headline,
            "summary":summary,"thesis":thesis,"factors":factors,
            "scenarios":scenario_for(tw) if session=="opening" else [],"validation":validation}
    save(path,record)
    idx=ROOT/"index.json"; items=load(idx,[])
    if not isinstance(items,list):raise ValueError("Invalid archive index")
    items=[x for x in items if (x.get("date"),x.get("session"))!=(DAY,session)]
    items.append({"date":DAY,"session":session,"status":"ok"})
    save(idx,items)
    base.LOG.info("Published %s %s",DAY,session)
    return 0

if __name__=="__main__":
    sys.exit(run(sys.argv[1] if len(sys.argv)>1 else ("opening" if NOW.hour<13 else "closing")))
