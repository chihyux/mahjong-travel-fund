# Google Sheet 建立說明

## 分頁架構（共 5 個）

### `Players`

| id  | name | active | created_at |
| --- | ---- | ------ | ---------- |

### `Tsumos` （自摸記錄，每局 +30）

| id  | date | player_id | count | amount | note | created_at |
| --- | ---- | --------- | ----- | ------ | ---- | ---------- |

- `count`：幾次自摸（通常 1）
- `amount`：自動 = 30 × count

### `Rounds` （每局結算記錄，一局 = 東南西北風打完）

一局 4 位玩家，**每位玩家一列**，以 `round_id` 關聯同一局。

| id  | round_id | date | player_id | amount | cut_amount | settled | settled_at | note | created_at |
| --- | -------- | ---- | --------- | ------ | ---------- | ------- | ---------- | ---- | ---------- |

- `round_id`：同一局 4 列共用（UUID）；一局 = 4 列
- `amount`：該玩家在這局的淨輸贏，可正（贏）可負（輸）
- **同一 `round_id` 的 4 列 `amount` 總和必須 = 0**（前後端皆驗證）
- `cut_amount`：只有贏家有（= `round(amount × cut_ratio)`），輸家為 `0`
- 入公基金金額 = Σ `cut_amount`（贏家付）
- `settled`：是否已結算（按週批次標記）
- `settled_at`：標記結算的時間戳；未結算則為空

### `Withdrawals` （旅遊支出）

| id  | date | amount | note | created_at |
| --- | ---- | ------ | ---- | ---------- |

### `Settings` (key-value)

| key             | value              |
| --------------- | ------------------ |
| admin_password  | `1234`             |
| tsumo_amount    | `30`               |
| cut_ratio       | `0.1`              |
| goal            | `10000`            |
| goal_name       | `下一次旅遊 2027.04` |
| group_name      | `家庭旅遊基金`     |
| currency_symbol | `$`                |
