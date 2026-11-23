#!/usr/bin/env python3
"""Market Pulse: closing data only; missing data is never fabricated."""
import json
import logging
import math
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo
import requests
import yfinance as yf

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
DATA.mkdir(exist_ok=True)
NOW=datetime.now(timezone.utc)
TPE=NOW.astimezone(ZoneInfo("Asia/Taipei"))
logging.basicConfig(level=logging.INFO,format="%(levelname)s %(message)s")
LOG=logging.getLogger("market")
INDICES={
 "sp500":("^GSPC","S&P 500"),"nasdaq":("^IXIC","Nasdaq"),
 "dow":("^DJI","Dow Jones"),"russell":("^RUT","Russell 2000"),
 "sox":("^SOX","SOX 費城半導體"),"vix":("^VIX","VIX"),
 "usd_twd":("TWD=X","USD/TWD"),"us10y":("^TNX","美國10年債殖利率")}
WATCH={"2330.TW":"台積電","2454.TW":"聯發科","2308.TW":"台達電",
 "2317.TW":"鴻海","NVDA":"Nvidia","AMD":"AMD","AVGO":"Broadcom",
 "MU":"Micron","MSFT":"Microsoft","0050.TW":"0050 元大台灣50",
 "0052.TW":"0052 富邦科技","00662.TW":"00662 富邦NASDAQ",
 "00646.TW":"00646 元大S&P500","VOO":"VOO Vanguard S&P500"}

def numeric(x):
 try:
  x=float(str(x).replace(",","").strip().replace("＋","+").replace("－","-"))
  return round(x,6) if math.isfinite(x) else None
 except (ValueError,TypeError):return None

def yahoo(symbol,label,retries=2):
 for attempt in range(retries):
  try:
   df=yf.Ticker(symbol).history(period="10d",interval="1d",auto_adjust=False,actions=False).dropna(subset=["Close"])
   if len(df)<2:raise ValueError("Insufficient closes")
   value=numeric(df.iloc[-1]["Close"])
   previous=numeric(df.iloc[-2]["Close"])
   if not value or not previous or value<=0:raise ValueError("Invalid price")
   day=df.index[-1].date().isoformat()
   return {"name":label,"symbol":symbol,"value":round(value,4),
    "change":round(value-previous,4),"pct":round(100*(value/previous-1),3),
    "date":day,"source":"Yahoo Finance（非官方、可能延遲）",
    "url":"https://finance.yahoo.com/quote/"+quote(symbol,safe="")}
  except Exception as exc:
   LOG.warning("Yahoo %s failed: %s",symbol,exc)
   time.sleep(0.4)
 return None

def twse():
 months=[TPE.replace(day=1),(TPE.replace(day=1)-timedelta(days=1)).replace(day=1)]
 for m in months:
  url="https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date="+m.strftime("%Y%m%d")
  try:
   r=requests.get(url,timeout=22,headers={"User-Agent":"Mozilla/5.0"})
   r.raise_for_status()
   obj=r.json()
   fields=obj.get("fields",[])
   idx=next((i for i,x in enumerate(fields) if "發行量加權股價指數" in str(x)),4)
   rows=[]
   for row in obj.get("data",[]):
    mat=re.search(r"(\d{2,3})/(\d{1,2})/(\d{1,2})",str(row[0]))
    if not mat or len(row)<=idx:continue
    day=f"{int(mat[1])+1911:04d}-{int(mat[2]):02d}-{int(mat[3]):02d}"
    value=numeric(row[idx])
    change=numeric(row[idx+1]) if len(row)>idx+1 else None
    if value and value>1000:rows.append((day,value,change))
   if not rows:continue
   day,value,change=max(rows,key=lambda x:x[0])
   return {"name":"TAIEX 加權指數","symbol":"TAIEX","value":value,"change":change,
    "pct":round(100*change/(value-change),3) if change is not None and value!=change else None,
    "date":day,"source":"臺灣證券交易所（官方）",
    "url":"https://www.twse.com.tw/zh/trading/historical/fmtqik.html"}
  except Exception as exc:LOG.warning("TWSE failed: %s",exc)
 return None

def news():
 out=[]; seen=set()
 for region,q in [("台灣","台股 台積電 聯發科 外資 股市"),
                  ("美國","US stocks S&P Nasdaq Federal Reserve AI semiconductors")]:
  url="https://news.google.com/rss/search?q="+quote(q)+"&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
  try:
   r=requests.get(url,timeout=18,headers={"User-Agent":"Mozilla/5.0"})
   r.raise_for_status()
   for item in ET.fromstring(r.content).findall(".//channel/item")[:15]:
    title=(item.findtext("title") or "").strip()
    link=(item.findtext("link") or "").strip()
    try:dt=parsedate_to_datetime(item.findtext("pubDate")).astimezone(timezone.utc)
    except (ValueError,TypeError):continue
    age=(NOW-dt).total_seconds()
    if not (0<=age<=7*86400) or not title or not link.startswith("https://") or title in seen:continue
    seen.add(title)
    sn=item.find("source")
    source=sn.text if sn is not None and sn.text else "Google News"
    out.append({"region":region,"title":title,"url":link,"source":source,"published_at":dt.isoformat()})
  except Exception as exc:LOG.warning("News feed failed: %s",exc)
 return sorted(out,key=lambda x:x["published_at"],reverse=True)[:12]

def risk(p):
 try:
  v=p["vix"]["value"]; tw=p["taiex"].get("pct")
 except (KeyError,TypeError):return {"level":"資料不足","score":None,"signals":["缺少核心行情"],"description":"非回測規則，不是投資建議"}
 score=0;signals=[]
 if v>=30:score+=3;signals.append("VIX ≥ 30")
 elif v>=25:score+=2;signals.append("VIX ≥ 25")
 elif v>=20:score+=1;signals.append("VIX ≥ 20")
 if tw is not None and tw<=-4:score+=2;signals.append("台股單日跌幅 ≥ 4%")
 elif tw is not None and tw<=-2:score+=1;signals.append("台股單日跌幅 ≥ 2%")
 sp=p.get("sox",{}).get("pct")
 if sp is not None and sp<=-3:score+=2;signals.append("SOX單日跌幅 ≥ 3%")
 elif sp is not None and sp<=-1:score+=1;signals.append("SOX單日跌幅 ≥ 1%")
 if p.get("us10y",{}).get("value",0)>=5:score+=1;signals.append("美國10年債 ≥ 5%")
 if p.get("usd_twd",{}).get("value",0)>=33:score+=1;signals.append("USD/TWD ≥ 33")
 return {"level":"極高" if score>=6 else "高" if score>=4 else "偏高" if score>=2 else "一般",
  "score":score,"signals":signals or ["未觸發列出的規則"],
  "description":"固定觀察規則，非AI預測、非回測模型或投資建議。"}

def main():
 p={"taiex":twse() or yahoo("^TWII","TAIEX 加權指數")}
 for key,(symbol,label) in INDICES.items():
  value=yahoo(symbol,label)
  if value:p[key]=value
 watch=[]
 for symbol,label in WATCH.items():
  entry=yahoo(symbol,label,retries=1)
  if entry:watch.append(entry)
  time.sleep(0.1)
 required=["taiex","sp500","nasdaq","dow","vix"]
 missing=[k for k in required if not p.get(k)]
 if missing:
  LOG.error("Missing required indicators %s; existing data left unchanged",missing)
  return 2
 for k in required:
  try:age=(TPE.date()-datetime.fromisoformat(p[k]["date"]).date()).days
  except (ValueError,TypeError,KeyError):age=999
  if age< -1 or age>5:
   LOG.error("Stale required quote: %s age=%s",k,age)
   return 3
 coverage={k:p.get(k,{}).get("date") for k in ("taiex","sp500","sox","vix","usd_twd","us10y")}
 warnings=[k+" 來源暫不可用" for k in ("sox","usd_twd","us10y","russell") if k not in p]
 if not watch:warnings.append("個股報價暫不可用")
 stories=news()
 if not stories:warnings.append("新聞RSS暫無可用資料")
 record={"status":"ok","generated_at":NOW.isoformat(),"display_timezone":"Asia/Taipei",
  "coverage":coverage,"prices":p,"watchlist":watch,"news":stories,
  "risk":risk(p),"warnings":warnings,
  "methodology":"僅最近完成交易日收盤與可能延遲行情；新聞為來源原始標題。ChatGPT每日對話不會自動同步。"}
 def load(path,default):
  try:return json.loads(path.read_text(encoding="utf-8"))
  except (OSError,ValueError):return default
 path=DATA/"history.json"
 history=load(path,[])
 if not isinstance(history,list):history=[]
 key=lambda x: str(x.get("coverage",{}).get("taiex"))+"|"+str(x.get("coverage",{}).get("sp500"))
 history=[x for x in history if isinstance(x,dict) and key(x)!=key(record)]
 history.append({k:record[k] for k in ("generated_at","coverage","prices","risk")})
 history=sorted(history,key=lambda x:x["generated_at"])[-730:]
 (DATA/"latest.json").write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 path.write_text(json.dumps(history,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 LOG.info("Updated %s markets and %s stocks",len(p),len(watch))
 return 0

if __name__=="__main__":sys.exit(main())
