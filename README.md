# Market Pulse｜台美股每日市場儀表板

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
GitHub Actions 設定平日台灣時間 09:15、17:45 嘗試更新。排程不保證準時；休市與來源異常可能延遲。網頁每次載入最新 JSON；不會直接讀取 ChatGPT 的排程或歷史對話。

## 資料來源與風險
- TAIEX：https://www.twse.com.tw/
- Yahoo Finance（yfinance）：https://finance.yahoo.com/
- Google News RSS：https://news.google.com/
- 請依資料供應商的使用條款評估公開再散布；非商用研究用途，不保證即時或完整。
