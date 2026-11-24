# Market Pulse 3.0 行情服務啟用指南

首頁已加入盤中監測、60 秒刷新、分時走勢及歷史情境統計。原有定時報告、歷史快報保留。預設即時服務停用，避免未授權再散布。

## 啟用 Cloudflare Worker
1. 先取得允許公開網頁展示及快取的行情供應商授權，並取得 HTTPS JSON endpoint（若供應商格式不同，需要實作轉接器）。
2. 安裝 Node.js，進入 worker/，執行 npx wrangler login。
3. 設定 wrangler.toml 的 PUBLIC_DISPLAY_AUTHORIZED 為 "true"（僅在確認授權後）。
4. npx wrangler secret put FEED_URL；輸入上游 HTTPS URL。若需要 token，再執行 npx wrangler secret put FEED_TOKEN。不得提交憑證到 GitHub。
5. npx wrangler deploy，記錄實際 Worker HTTPS 網址。
6. 以 GitHub 編輯 data/live-config.json，enabled 設為 true，endpoint 設為 Worker 網址加 /quotes，refresh_seconds 保持 60。
7. 確認正式站有來源時間、價格、延遲狀態，以及來源斷線時的降級顯示。

## 上游資料契約
JSON: { "quotes": { "taiex": { "value": number, "pct": number|null, "change": number|null, "asof": "ISO 8601 with offset", "source": string, "unit": string, "delay_minutes": number|null } }, "points": [{ "asof": "ISO 8601", "value": number }] }
支援鍵：taiex, tsmc, turnover, advancers, decliners, sp500, nasdaq, dow, russell, sox, vix, usd_twd, us10y, es, nq, tx。分時 points 僅為 TAIEX。沒有資料的鍵省略；不可填入猜測值。成交額單位由供應商明示。Worker 55 秒共用快取，非全域硬性頻率保證；正式供應商的授權與限制仍適用。

## 分析
即時面板是規則式監測，不是生成式 AI。每日早盤與收盤使用原有 data/reports 日期與時段資料契約，生成式 AI 或半小時摘要需另行配置受控後端與費用上限，不在公開端暴露金鑰。情境統計排除 demo，情境出現頻率不是預測勝率。

## 回復
v2.html 保留 2.0 首頁快照，archive.html 保存原始歷史快報。正式入口仍為 https://hubert066.github.io/stock/。
