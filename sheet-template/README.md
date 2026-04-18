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

### `Settlements` （週結算記錄，抽 10%）

| id  | date | player_id | win_amount | cut_amount | note | created_at |
| --- | ---- | --------- | ---------- | ---------- | ---- | ---------- |

- `win_amount`：當期贏金額（選填）
- `cut_amount`：入公基金金額（必填，通常 = win_amount × 10%）

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
| goal_name       | `京都賞櫻 2026.04` |
| group_name      | `家庭旅遊基金`     |
| currency_symbol | `$`                |
