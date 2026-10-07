# mahjong-travel-fund

給家人一起記帳 + 累積旅遊基金的輕量 Web App。以「每局結算」為核心記帳流程（同一張表單順手記自摸），長輩友善的大字高對比 UI，資料存在 Google Sheet。

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/Vite-5-646cff) ![stack](https://img.shields.io/badge/Tailwind-3-38bdf8) ![stack](https://img.shields.io/badge/Backend-Apps_Script-4285f4)

## 用途

小群體共同累積一筆基金（例如旅遊、聚會），記錄每次進帳與支出，畫面上看得到餘額、目標達成進度、每位成員的累積貢獻。

**進帳流程（每局結算）**：打完東南西北風後，在同一張表單記下 4 人輸贏（總和必為 0），並順手勾選該局誰自摸了幾次，一次送出就完成整局記錄。兩種進基金來源：

- **每局抽成**：贏家金額 × 10%（可調）自動進基金
- **自摸**：每次定額（預設 30 元，可調）進基金

「週結算」檢視按週聚合所有局，管理員可批次標記「已結算」當作核帳狀態（純會計標記，不動任何金額）。首頁另有「已結算排名」，只計已結算週的資料，顯示每人淨值與場數、勝率、每局平均、自摸率等統計。

支出（旅遊消費、共同支出）另有獨立分頁；所有歷史可追溯、可編修。訪客可唯讀瀏覽，寫入需管理員密碼。

**多帳本**：可以開多本帳本（例如「旅遊基金」、「聚餐基金」），右上方的選單切換。每本帳的局、自摸、支出、規則（自摸金額、抽成比例、結算日）與目標各自分開；玩家名單所有帳本共用，可以從現有玩家拉入，停用狀態則各帳本分開記。畫面上「旅遊支出」「旅遊目標名稱」這類文字依帳本的用途（`purpose`）組出來。

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
- 儲存層：Google Sheet，全域分頁（`Players` / `Settings` / `Ledgers`）加上每本帳一組分頁當作 table
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
- 衍生資料：餘額、玩家貢獻、週聚合、已結算排名（淨值 / 場數 / 勝率 / 每局平均 / 自摸率）皆在前端 `lib/utils.ts` 由 `getAll` 快照即時計算，後端只存原始列
- 帳本：`getAll` 一次回傳所有帳本；`useStore` 記住目前帳本（localStorage `mtf_ledger`），對元件提供該帳本的資料視圖（`buildLedgerView`），寫入時自動帶 `ledger_id`。每局結算填到一半就切換帳本會先跳確認
- 路由：自管 `ViewKey` state，`Shell` 依 `isAdmin` 呈現不同導覽；訪客看到首頁 / 紀錄 / 週結算（唯讀）/ 管理員登入
- API client：`lib/api.ts` 以 `fetch` 直打 Apps Script endpoint
  - GET：`?action=getAll`
  - POST：`{ action, password?, ...payload }`，寫入類請求帶 password
- 錯誤處理：API 統一 `{ ok, data?, error?, code? }`；client 遇 `ok: false` 丟 `ApiError`（含 `code`），store 的 `wrap()` 統一 toast、遇 `UNAUTHORIZED` 自動登出
- 認證：密碼存 localStorage，訪客模式唯讀
- IME 友善：`onKeyDown` 送出前檢查 `e.nativeEvent.isComposing`，避免中文輸入法上字時誤觸

## 後端實作（Apps Script）

以單一 `.gs` 檔處理所有讀寫：

- `doGet(e)`：讀取流程，回傳全域分頁與所有帳本的完整 snapshot
- `doPost(e)`：以 `action` 字串 dispatch，寫入類動作先驗密碼（比對 `Settings.admin_password`）；寫入成功的回應多帶 `snapshot`（同 `getAll` 的資料），前端直接用，不再另外打 `getAll`
- `addRoundWithTsumos`：一次寫入該局 4 列 `Rounds__L*` 與對應 `Tsumos__L*` 列（前端主要進帳入口）；帳本層級的寫入都帶 `ledger_id`
- 資料存取：`SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)`；以欄位 header row 對應成 object，避免硬編欄位 index
- 新增：`appendRow`；更新：`getDataRange().getValues()` 後找 row index 再 `setValue()`；刪除：`deleteRow`
- ID 生成：`{prefix}_{yyyyMMddHHmmss}_{rand}`，從 ID 即可看出類型與建立時間
- 時間戳：`new Date().toISOString()` 寫入 `created_at`
- 回傳：`ContentService.createTextOutput(JSON.stringify(...)).setMimeType(JSON)`；統一 `{ ok, data, snapshot?, error?, code? }` 形狀
- `initSheets()`：首次部署建立全域分頁與 L1 的整套分頁；既有分頁/設定不覆蓋
- `createLedger()`：在編輯器改好開頭的參數後執行，建立新帳本（見「新增帳本」）
- `migrateToLedgers()`：從單一帳本版本升級用，一次性（見「從單一帳本版本升級」）

## 資料模型

全域分頁：`Players` / `Settings` / `Ledgers`。每本帳一組分頁：`Rounds__L*` / `Tsumos__L*` / `Withdrawals__L*` / `Members__L*`（`L*` 是帳本代號，例如 `Rounds__L2`）。
欄位定義見 [`sheet-template/README.md`](./sheet-template/README.md)。

關鍵規則：

- `Tsumos.amount = tsumo_amount × count`（後端以該帳本 `Ledgers.tsumo_amount` 計算）
- `Rounds`：一局四列共用 `round_id`，同一 `round_id` 的 `Σ amount = 0`；`cut_amount = max(0, amount) × cut_ratio`（只有贏家有值，用該帳本的 `cut_ratio`）
- 週結算為批次「已結算」狀態（`settled` / `settled_at`），僅表會計狀態，不影響金額；一週 7 天，結算日（`Ledgers.settle_weekday`）是週期的最後一天
- 每本帳各自計算：餘額 = Σ `Tsumos.amount` + Σ `Rounds.cut_amount` − Σ `Withdrawals.amount`
- `Settings` 只放全域設定（`admin_password`、`currency_symbol`）；帳本名稱、目標與規則放在 `Ledgers`
- 金額在寫入當下算好存入，事後改 `tsumo_amount`、`cut_ratio` 只影響之後新記的資料
- 帳本已有資料後再改結算日，某一週可能同時有已結算與未結算的局，那一週會顯示為未結算，需要重新標記

## 設計系統

- Mobile-first：主要使用情境是牌桌邊用手機隨手記，因此以手機直式為第一優先——單欄、底部大按鈕導覽、大字大觸控區；桌機版面是往上加寬後的延伸
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

讀取加速：在 Apps Script 編輯器左側「服務 → 新增」加入 **Google Sheets API**，`getAll` 會用 `batchGet` 一次讀完所有分頁（每讀一個分頁約 0.3 秒，分頁越多差越多）。沒加入或呼叫失敗時會自動退回逐頁讀取，只是比較慢。加入後要在編輯器執行任一函式完成授權，再部署新版本。免費，用量上限為每位使用者每分鐘 60 次讀取；網頁應用程式以「我」的身分執行，全家的讀取都算在同一個使用者。

快取：`getAll` 的結果與 `Settings`（含管理員密碼）存在 Apps Script 的 CacheService，最多 6 小時，命中時不用開試算表。閒置後第一次開 App 或登入原本會卡十幾秒以上，有快取就不會。App 的寫入會自動清快取；直接在試算表上改儲存格的值（例如改 `Ledgers` 或 `admin_password`）會由 `onEdit` 清快取。刪除或插入整列、新增或刪除分頁不會觸發 `onEdit`，做完這類變動要在編輯器執行 `clearCache()`；其他情況改完 App 還是舊資料，也一樣執行 `clearCache()`。

## 新增帳本

App 裡沒有建立帳本的入口，在 Apps Script 編輯器操作：

1. 打開 `createLedger()`，改函式開頭 `input` 的值：`name`（帳本名稱，不可跟現有帳本同名）、`purpose`（用途的一個詞，例如「聚餐」，可留空）、`tsumo_amount`、`cut_ratio`、`settle_weekday`（結算日，填 `一` 到 `日` 其中一個字）
2. 選 `createLedger` 按「執行」，完成後會跳出新帳本的代號
3. 回到 App，到該帳本的「玩家管理」拉入或新增玩家；目標名稱與金額在「設定」頁填

`tsumo_amount`、`cut_ratio`、`purpose`、`settle_weekday` 之後要改，直接改 `Ledgers` 分頁該帳本那一列。App 不提供帳本的封存或刪除。

## 從單一帳本版本升級（一次性）

新版後端不相容舊版前端，升級期間會有幾分鐘無法使用，挑沒有人在記帳的時間做，依序：

1. 在 Sheet 用「檔案 → 建立副本」備份
2. 在 Apps Script 編輯器貼上新版 `Code.gs`，執行 `migrateToLedgers()`：現有的 `Rounds` / `Tsumos` / `Withdrawals` 改名為 `__L1`，`Settings` 裡的帳本設定搬到 `Ledgers` 的 L1，現有玩家成為 L1 的成員並沿用停用狀態，`Players.active` 欄刪除
3. 「管理部署 → 編輯 → 新版本」部署後端
4. 部署前端

Apps Script 沒有交易，migration 中途失敗會停在半套狀態，用 Sheet 的版本紀錄或第 1 步的副本還原。已經 migrate 過再執行會被擋下。

## 備註

- Apps Script 每次修改程式要「管理部署 → 編輯 → 新版本」才會生效，URL 不變
- 寫入走單一 doPost，沒有 race-condition 保護，設計上僅支援單一管理員
- Sheet 檔案的 Google 原生版本歷史即為備份
