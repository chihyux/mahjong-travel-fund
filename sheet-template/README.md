# Google Sheet 建立說明

新安裝在 Apps Script 編輯器執行一次 `initSheets()`，會建立下列全域分頁與帳本 L1 的整套分頁。之後的新帳本用 `createLedger()` 建立（見專案根目錄 README 的「新增帳本」）。

## 全域分頁

### `Players`（全部帳本共用）

| id  | name | created_at |
| --- | ---- | ---------- |

- `name` 全域唯一（新增與改名時由後端檢查）
- 玩家在某本帳是否停用，記在該帳本的 `Members__L*`

### `Settings` (key-value，只放全域設定)

| key             | value |
| --------------- | ----- |
| admin_password  | `1234` |
| currency_symbol | `$`    |

### `Ledgers`（一本帳一列）

| id  | name | purpose | goal | goal_name | tsumo_amount | cut_ratio | settle_weekday | created_at |
| --- | ---- | ------- | ---- | --------- | ------------ | --------- | -------------- | ---------- |

- `id`：帳本代號，`L` 加正整數（`L1`、`L2`…），建立後不變
- `name`：帳本名稱，顯示在右上方的切換選單；不可跟其他帳本同名。App 設定頁可改
- `purpose`：用途的一個詞，例如「旅遊」，畫面組成「旅遊支出」「旅遊目標名稱」等文字；留空則顯示「支出」「目標名稱」
- `goal`、`goal_name`：存錢目標。App 設定頁可改
- `tsumo_amount`：每次自摸進基金的金額；空白或不合法時用 30
- `cut_ratio`：贏家抽成比例；空白或不合法時用 0.1
- `settle_weekday`：結算日，填 `一`、`二`、`三`、`四`、`五`、`六`、`日` 其中一個字；結算日是週期的最後一天，當天的局算進這一週。空白或填錯時當成 `日`（一週是週一到週日）
- `purpose`、`tsumo_amount`、`cut_ratio`、`settle_weekday` 只能直接改這個分頁

## 每本帳的分頁

分頁名稱是「原名 + `__` + 帳本代號」，例如 L2 的局在 `Rounds__L2`。

### `Members__L*`（這本帳的玩家）

| player_id | active | created_at |
| --------- | ------ | ---------- |

- `active`：在這本帳是否啟用；停用只影響這本帳
- `created_at`：加入這本帳的時間
- 玩家不能刪除，只能停用

### `Tsumos__L*` （自摸記錄）

隨每局結算一併記錄：在「每局結算」表單勾選該局誰自摸幾次，送出時後端與該局 `Rounds__L*` 列一起寫入（`addRoundWithTsumos`）。

| id  | date | player_id | count | amount | note | created_at |
| --- | ---- | --------- | ----- | ------ | ---- | ---------- |

- `count`：該局自摸次數
- `amount`：自動 = 該帳本 `tsumo_amount` × count

### `Rounds__L*` （每局結算記錄，一局 = 東南西北風打完）

一局 4 位玩家，**每位玩家一列**，以 `round_id` 關聯同一局。

| id  | round_id | date | player_id | amount | cut_amount | settled | settled_at | note | created_at |
| --- | -------- | ---- | --------- | ------ | ---------- | ------- | ---------- | ---- | ---------- |

- `round_id`：同一局 4 列共用；一局 = 4 列
- `player_id`：必須是這本帳的成員
- `amount`：該玩家在這局的淨輸贏，可正（贏）可負（輸）
- **同一 `round_id` 的 4 列 `amount` 總和必須 = 0**（前後端皆驗證）
- `cut_amount`：只有贏家有（= `round(amount × cut_ratio)`，用該帳本的 `cut_ratio`），輸家為 `0`
- 入公基金金額 = Σ `cut_amount`（贏家付）
- `settled`：是否已結算（按週批次標記）
- `settled_at`：標記結算的時間戳；未結算則為空

### `Withdrawals__L*` （支出）

| id  | date | amount | note | created_at |
| --- | ---- | ------ | ---- | ---------- |
