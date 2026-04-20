# mahjong-travel-fund

給家人一起記帳 + 累積旅遊基金的輕量 Web App。支援麻將自摸 + 每局結算兩種記帳方式，長輩友善的大字高對比 UI，資料存在 Google Sheet。

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/Vite-5-646cff) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8) ![stack](https://img.shields.io/badge/Backend-Apps_Script-4285f4)

## 用途

小群體共同累積一筆基金（例如旅遊、聚會），記錄每次進帳與支出，畫面上看得到餘額、目標達成進度、每位成員的累積貢獻。

兩種進帳流程：

- **自摸**：每局定額加一筆（預設 30 元），適合當下就記的高頻小額場景
- **每局結算**：打完東南西北風後一次記 4 人輸贏（總和必為 0），贏家金額 × 10%（可調）自動進基金

另有「週結算」檢視：按週聚合所有局的資料，管理員可批次標記「已結算」作為核帳狀態（只改 `settled` 旗標，不動金額）。

支出（旅遊消費、共同支出）另有獨立分頁；所有歷史可追溯、可編修。訪客可唯讀瀏覽，寫入需管理員密碼。

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
├── frontend/               # React SPA（TypeScript）
│   ├── src/
│   │   ├── components/     # 畫面與 UI 元件
│   │   ├── hooks/          # useStore（全域狀態 + actions）
│   │   ├── lib/            # api.ts（HTTP）、utils.ts（格式化、計算、日期）
│   │   ├── config.ts       # import.meta.env.VITE_API_URL
│   │   ├── types.ts        # 資料模型與 API 封包型別
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── backend/
│   └── Code.gs             # Apps Script 單檔（doGet / doPost / handlers）
├── sheet-template/
│   └── README.md           # Sheet 欄位定義
└── vercel.json             # SPA rewrite 規則
```

## 前端實作重點

- 狀態管理：自建 `useStore`（Context + `useState`），actions 封裝 API 呼叫；寫入成功後 re-fetch `getAll` 保持一致性（Sheet 為 source of truth）
- 路由：自管 `ViewKey` state，`Shell` 依 `isAdmin` 呈現不同導覽；訪客看到首頁 / 紀錄 / 週結算（唯讀）/ 管理員登入
- API client：`lib/api.ts` 以 `fetch` 直打 Apps Script endpoint
  - GET：`?action=getAll`
  - POST：`{ action, password?, ...payload }`，寫入類請求帶 password
- 錯誤處理：API 統一 `{ ok, data?, error?, code? }`；client 遇 `ok: false` 丟 `ApiError`（含 `code`），store 的 `wrap()` 統一 toast、遇 `UNAUTHORIZED` 自動登出
- 認證：密碼存 localStorage，訪客模式唯讀
- IME 友善：`onKeyDown` 送出前檢查 `e.nativeEvent.isComposing`，避免中文輸入法上字時誤觸

## 後端實作（Apps Script）

以單一 `.gs` 檔處理所有讀寫：

- `doGet(e)`：讀取流程，回傳 5 張分頁的完整 snapshot
- `doPost(e)`：以 `action` 字串 dispatch，寫入類動作先驗密碼（比對 `Settings.admin_password`）
- 資料存取：`SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)`；以欄位 header row 對應成 object，避免硬編欄位 index
- 新增：`appendRow`；更新：`getDataRange().getValues()` 後找 row index 再 `setValue()`；刪除：`deleteRow`
- ID 生成：`{prefix}_{yyyyMMddHHmmss}_{rand}`，從 ID 即可看出類型與建立時間
- 時間戳：`new Date().toISOString()` 寫入 `created_at`
- 回傳：`ContentService.createTextOutput(JSON.stringify(...)).setMimeType(JSON)`；統一 `{ ok, data, error?, code? }` 形狀
- `initSheets()`：首次部署建立 5 個分頁與 header row；既有分頁/設定不覆蓋

## 資料模型

5 個分頁：`Players` / `Tsumos` / `Rounds` / `Withdrawals` / `Settings`。
欄位定義見 [`sheet-template/README.md`](./sheet-template/README.md)。

關鍵規則：

- `Tsumos.amount = tsumo_amount × count`（後端以 Settings 的 `tsumo_amount` 計算）
- `Rounds`：一局四列共用 `round_id`，同一 `round_id` 的 `Σ amount = 0`；`cut_amount = max(0, amount) × cut_ratio`（只有贏家有值）
- 週結算為批次「已結算」狀態（`settled` / `settled_at`），僅表會計狀態，不影響金額
- 餘額 = Σ `Tsumos.amount` + Σ `Rounds.cut_amount` − Σ `Withdrawals.amount`
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
