# 玩家統計（場次、勝率、平均每局盈虧、自摸率）設計

日期：2026-07-10
狀態：已與使用者確認

## 目標

在 Dashboard 的「已結算排名」卡片中，為每位玩家加入：

- 場次（已玩幾局）
- 勝率
- 平均每局盈虧
- 自摸率

純前端 derived data，不動後端 `Code.gs`、不改資料表結構、不新增頁面。

## 統計口徑

只計入**已結算週**的局，與卡片現有「截至 X（已結算 N 週）」口徑一致。

- `roundCount`：玩家在已結算週中出現的 round 列數（一局一列）。
- `winRate`：該玩家 `amount > 0` 的局數 ÷ `roundCount`。`amount ≤ 0` 不算勝。
- `avgPerRound`：`winLoss ÷ roundCount`（winLoss 為現有欄位，抽成前的原始盈虧總和）。
- 自摸率：現有 `tsumoCount ÷ roundCount`，不新增欄位。
- `roundCount === 0` 時，`winRate` 與 `avgPerRound` 為 `null`（避免除以零）。

## 實作

### `frontend/src/lib/utils.ts`

`buildSettledRanking()` 現有迴圈已逐局迭代已結算資料，在同一迴圈累計：

- `roundCountByPid`：每列 +1
- `winCountByPid`：`Number(row.amount) > 0` 時 +1

`SettledRankingEntry` 新增欄位：

```ts
roundCount: number;
winRate: number | null;     // winCount / roundCount，0 場為 null
avgPerRound: number | null; // winLoss / roundCount，0 場為 null
```

不另寫獨立的 `buildPlayerStats()` — 重複迭代且日後兩套口徑容易不一致。

### `frontend/src/components/Dashboard.tsx`

「已結算排名」每位玩家現有副標題行（贏/輸 · 抽成 · 自摸）下方新增一行小字：

```
已玩 12 場 · 勝率 58% · 平均 +$27/場 · 自摸率 25%
```

- 勝率、自摸率四捨五入為整數百分比。
- 平均每局用現有 `fmtSignedMoney` 格式化，後綴「/場」。
- `roundCount === 0`（只有自摸或抽成記錄的玩家）：只顯示「已玩 0 場」，不顯示勝率、平均、自摸率。

## 錯誤處理

- Sheets 回傳的 `amount` 可能是字串，沿用現有 `Number(...) || 0` 慣例。
- 除以零由 `null` 守住，顯示層以 `null` 判斷隱藏。

## 測試

repo 無測試框架，不為此引入。實作完成後以一個可拋棄的 `npx tsx` 腳本（assert 三個情境）驗證：正常多局的勝率與平均、`amount = 0` 不算勝、0 場玩家回傳 `null` 而非 NaN。腳本驗證後即刪除，不進 repo。

## 不做的事

- 連勝/連敗統計（使用者未選）
- 新統計頁面
- 含未結算局的即時統計
