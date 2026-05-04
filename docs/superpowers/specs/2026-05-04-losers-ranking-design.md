# 輸家榜（Losers Ranking）設計

## 目的

在 Dashboard 上新增一張「輸家榜」卡片，跟現有「贊助榜」對稱，讓家人一眼看出誰是純牌桌輸贏的最大苦主。純娛樂性質，不影響任何金額或會計流程。

## 範圍

- 只動前端
- 不改後端、不改 Sheet schema、不新增 API
- 沿用既有 `rounds` 資料

## 計算邏輯

每位玩家的「淨輸贏」= 該玩家所有 `Rounds.amount` 加總（**不**扣自摸付的錢、**不**扣贏家被抽的成）。

- 來源：`rounds`（不取 `tsumos`）
- 篩選：總和 < 0 才上榜
- 排序：升冪（最負的在前）
- 取前 10 位
- 「N 局」= 該玩家在 rounds 中出現的列數

> 自摸與抽成是「貢獻基金」的概念，已在贊助榜呈現。輸家榜刻意只看牌桌淨輸贏，避免兩個榜定義重疊。

## 顯示規則

### 卡片位置
Dashboard 上「贊助榜」卡片**下方**新增一張獨立 Card。

### 顯示條件
- 至少 1 位玩家淨輸 < 0 才渲染整張卡片
- 全員無人在虧時整張卡片不顯示（不顯示空狀態，避免雜訊）

### 卡片內容

```
─────  輸家榜  ─────

①  阿明              12 局      −$3,200
②  阿華              8 局       −$1,500
③  老王              15 局      −$800
④  小美              5 局       −$400
...
```

每列：`紅色排名徽章 | 姓名 | 「N 局」 | 淨輸金額（紅色，負號）`

- 標題用同款 `font-serif text-[22px] font-bold`、左右分隔線跟贊助榜一致
- 金額用 `fmtSignedMoney()`（既有函式，會自動加 `−` 號）
- 顏色用 `text-red-700`（週結算頁面負值同款）
- 副資訊「N 局」放在姓名下方第二行，灰色 `text-ink-3`

### 排名徽章
- 1~3 名：紅色系徽章（top loser badge variant，新增）
- 4~10 名：沿用 `RankBadge` 的 `DEFAULT_STYLE` 灰底

### 訪客
跟贊助榜一致，訪客也看得到（資料本來就在 snapshot）。

## 實作改動

### 1. `frontend/src/lib/utils.ts`
新增純函式：

```ts
export interface LoserboardEntry {
  id: Id;
  name: string;
  netAmount: number;   // 負數
  roundCount: number;  // 出現列數
}

export function buildLoserboard(
  players: Player[],
  rounds: Round[] | undefined
): LoserboardEntry[]
```

行為：
- 對每位 player 計算 `Σ amount` 與出現次數
- filter `netAmount < 0`
- sort by `netAmount` ascending（最負在前）
- slice(0, 10)

不依賴 `tsumos`，跟 `buildLeaderboard` 並排放好對照。

### 2. `frontend/src/components/ui/RankBadge.tsx`
新增可選 prop `variant?: 'default' | 'loser'`。

- `variant='loser'` 且 `rank ∈ {1,2,3}`：用紅色系三階徽章（深紅→中紅→淺紅）
- `variant='loser'` 且 `rank ≥ 4`：fallback 到 `DEFAULT_STYLE`
- `variant` 未傳或 `'default'`：行為跟現在完全一致

紅色三階建議色（Tailwind red-900 / red-700 / red-500 對應，淺色字白）：
- 1: `#7F1D1D` 背景，`#FEE2E2` 字
- 2: `#B91C1C` 背景，`#FFFFFF` 字
- 3: `#DC2626` 背景，`#FFFFFF` 字

### 3. `frontend/src/components/Dashboard.tsx`
- import `buildLoserboard`
- 計算 `const losers = buildLoserboard(players, rounds);`
- 在贊助榜 Card 之後條件渲染新 Card：`{losers.length > 0 && (<Card>...）}`
- 卡片內結構複製贊助榜的 header / list pattern，徽章傳 `variant="loser"`

## 不做的事（YAGNI）

- 不做時間範圍篩選（本月/本週/全期）—— 需求未提，全期累計即可
- 不做圖表 —— 跟贊助榜的 ContributionPie 對稱沒意義（負值佔比不直觀）
- 不做「贏 X 局 / 輸 Y 局」拆解 —— 使用者選 A 簡版顯示
- 不做匯出 / 排名變化動畫 —— 超出娛樂範疇
- 不存設定（例如「隱藏輸家榜」開關）—— 純展示，看不順眼之後再加

## 測試重點

- 全員淨贏（無輸家）→ 卡片完全不渲染
- 1 位輸家 → 顯示 1 列，rank 1 紅徽章
- 4 位以上輸家 → rank 1~3 紅徽章、rank 4+ 灰徽章
- 11 位以上輸家 → 只顯示前 10
- 玩家淨值 = 0（贏一局輸一局剛好打平）→ 不上榜
- inactive 玩家但有 rounds 資料且淨輸 → 應上榜（資料就在）
- 已刪除玩家但 rounds 還在 → `playerName()` 會回 `(已刪除)`，可上榜

## 不影響的範圍

- `Settings`、`Tsumos`、`Withdrawals` 全部不動
- 後端 / Sheet schema 不動
- 餘額、贊助榜、週結算、最近活動的計算與顯示不動
- `RankBadge` 不傳 `variant` 時行為不變（贊助榜呼叫端不需改）
