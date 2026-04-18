# mahjong-travel-fund

給家人一起記帳 + 累積旅遊基金的輕量 Web App。支援麻將自摸 + 週結算兩種記帳方式，長輩友善的大字高對比 UI，資料存在 Google Sheet。

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/Vite-5-646cff) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8) ![stack](https://img.shields.io/badge/Backend-Apps_Script-4285f4)

## 用途

小群體共同累積一筆基金（例如旅遊、聚會），記錄每次進帳與支出，畫面上看得到餘額、目標達成進度、每位成員的累積貢獻。

兩種進帳流程：

- **自摸**：每局定額加一筆，適合高頻、小額、當下就記的場景
- **週結算**：按週/期回顧贏金額再抽成（預設 10%）進基金，適合事後補記

另有支出（旅遊消費、共同支出）記錄；所有歷史可追溯、可編修。訪客可唯讀瀏覽，寫入需管理員密碼。

## 為什麼後端用 Apps Script

- **零主機成本與維運**：不開 VM、不管 DB、不設 CI/CD；Google 帳號即環境
- **Google Sheet 當儲存**：擁有者可直接開 Sheet 檢視/修改資料，原生版本歷史即備份
- **部署單純**：單一 `.gs` 檔 + 「部署為 Web App」就有 HTTPS endpoint，免憑證、免 CORS 反代
- **免費額度寬鬆**：小流量情境遠低於 Apps Script 每日配額
- **規模剛好**：單管理員、讀多寫少、資料量小（年 order 千筆內），不需要交易、索引、併發控制

取捨：Apps Script 冷啟動慢（數百 ms 級）、無長連線、無 transaction；若要多人同時寫入或資料量放大，應該換成真正的後端 + DB。

## 架構

```
React SPA (Vercel)  ──fetch──▶  Apps Script Web App  ──▶  Google Sheet
```

- 前端：React 18 + Vite + Tailwind，SPA 部署到 Vercel
- 後端：Google Apps Script 單檔 `doGet` / `doPost`，部署為 Web App
- 儲存層：Google Sheet，5 個分頁當作 table
- 無資料庫、無伺服器成本

## 專案結構

```
mahjong-travel-fund/
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/     # 畫面與 UI 元件
│   │   ├── hooks/          # useStore（全域狀態 + actions）
│   │   ├── lib/            # api.js（HTTP）、utils.js（格式化、計算）
│   │   ├── config.js       # import.meta.env.VITE_API_URL
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
├── sheet-template/
│   └── README.md           # Sheet 欄位定義
└── vercel.json             # SPA rewrite 規則
```

## 前端實作重點

- 狀態管理：自建 `useStore`（Context + reducer pattern），單一 store、actions 封裝 API 呼叫與樂觀更新
- 路由：以 `Shell` 切分頁（Dashboard / Players / History / Withdrawals / Settings），非 react-router
- API client：`lib/api.js` 以 `fetch` 直打 Apps Script endpoint
  - GET：`?action=getAll`
  - POST：`{ action, password?, ...payload }`，統一 JSON body；寫入類請求帶 password
- 錯誤處理：API 統一回傳 `{ ok: boolean, data?, error?, code? }`，client 遇 `ok: false` 丟 Error、把 `code` 附在 error 物件上
- 狀態一致性：寫入成功後 re-fetch `getAll`，不做局部 patch（Sheet 為 source of truth）
- 認證：密碼在 localStorage（`mtf_password`），每個寫入請求帶上；訪客模式唯讀
- IME 友善：`onKeyDown` 送出前檢查 `e.nativeEvent.isComposing`，避免中文輸入法上字時誤觸

## 後端實作（Apps Script）

以單一 `.gs` 檔處理所有讀寫：

- `doGet(e)`：讀取流程，回傳 5 張分頁的完整 snapshot
- `doPost(e)`：以 `action` 字串 dispatch，寫入類動作先驗密碼（比對 `Settings.admin_password`）
- 資料存取：`SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)`；以欄位 header row 對應成 object，避免硬編欄位 index
- 新增：用 `appendRow`；更新：`getDataRange().getValues()` 後找 row index 再 `getRange().setValues()`；刪除：`deleteRow`
- ID 生成：`Utilities.getUuid()`
- 時間戳：`new Date().toISOString()` 寫入 `created_at`
- 回傳：`ContentService.createTextOutput(JSON.stringify(...)).setMimeType(JSON)`；統一 `{ ok, data, error?, code? }` 形狀
- `initSheets()`：一次性建立 5 個分頁與 header row，供首次部署執行

## 資料模型

5 個分頁：`Players` / `Tsumos` / `Settlements` / `Withdrawals` / `Settings`。
欄位定義見 [`sheet-template/README.md`](./sheet-template/README.md)。

關鍵規則：

- `Tsumos.amount = tsumo_amount × count`（前端計算後寫入）
- `Settlements.cut_amount` 為實際入公基金金額；`win_amount` 僅記錄用
- 餘額 = ΣTsumos.amount + ΣSettlements.cut_amount − ΣWithdrawals.amount
- `Settings` 為 key-value 單表，前端以 `getAll` 回傳的 settings object 使用

## 設計系統

- 主色 `#4A6B4A`（sage）+ `#B8781F`（honey）+ `#F3F1E9`（背景）
- Body 18px、主數字 76px、按鈕高 64px、對比度 15:1
- 字型：`Noto Sans TC`（含內文與數字）、`Noto Serif TC`（標題）
- Tokens 集中在 `frontend/tailwind.config.js` 的 `theme.extend`；`.num` 類別在 `src/index.css`

## 本地開發

```bash
cd frontend
npm install
cp .env.example .env.local
# 設定 VITE_API_URL = Apps Script Web App URL
npm run dev
```

## 部署

前端：Vercel（`vercel.json` 已含 SPA rewrite），建置環境變數 `VITE_API_URL`。
後端：Apps Script → 部署 → 網頁應用程式 → 執行身分「我」、存取權「所有人」→ 取得 `/exec` URL。
首次需在 Apps Script 編輯器手動跑一次 `initSheets()` 建立分頁與 header。

## 備註

- Apps Script 每次修改程式要「管理部署 → 編輯 → 新版本」才會生效，URL 不變
- 寫入走單一 doPost，沒有 race-condition 保護，設計上僅支援單一管理員
- Sheet 檔案的 Google 原生版本歷史即為備份
