# Market Pulse 2.0｜台美股每日市場儀表板

繁體中文手機友善的公開市場研究儀表板。

## 公開網站
https://hubert066.github.io/stock/

## 功能
- 台股 TAIEX 官方收盤指數；美股主要指數、SOX、VIX、USD/TWD、10年期美債指標為 Yahoo Finance 非官方報價（可能延遲）。
- 台美個股與 ETF 觀察清單。
- Google News RSS 的新聞標題、來源與發布時間（新聞內容未經人工核實）。
- 透明的規則式風險評級；不是投資建議或經回測的預測。
- 歷史快報為舊 ChatGPT 對話摘要，未重新核實，獨立於最新行情。

## 首次啟用
1. GitHub → Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save。
2. GitHub → Settings → Actions → General → Workflow permissions → Read and write permissions → Save。
3. GitHub → Actions → Daily Taiwan and US market dashboard → Run workflow。
4. 檢查工作流程狀態為綠色，及 data/latest.json 中 status 為 ok。

## 更新時間
GitHub Actions 設定平日台灣時間 09:15 早盤、13:40 收盤；09:25 與 17:45 為缺值補抓，已有的分時段報告不覆寫。早盤採截至 09:15 的可用 Yahoo Finance 1 分鐘 K 線，收盤採同日 TWSE 官方收盤；無當日台股資料則不發布。排程及來源可能延遲，報告明示來源時間。15:30 籌碼頁保留入口，尚未接資料。新報告保存在 `data/reports/YYYY-MM-DD/{opening,closing}.json`，由 `data/reports/index.json` 歸檔。分析是規則式研究評論，非 AI 生成或回測模型。舊站 `archive.html` 保留 45 期歷史快報及原資料讀取；`demo-2026-11-24.html` 是明確標示未重新核實的回溯試跑。正式排程首次成功及 Pages 發布需於 Actions 檢查。

## 資料來源與風險
- TAIEX：https://www.twse.com.tw/
- Yahoo Finance（yfinance）：https://finance.yahoo.com/
- Google News RSS：https://news.google.com/
- 請依資料供應商的使用條款評估公開再散布；非商用研究用途，不保證即時或完整。
