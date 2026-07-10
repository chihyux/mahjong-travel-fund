# 玩家統計（場次、勝率、平均每局、自摸率）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Dashboard「已結算排名」卡片為每位玩家加一行「已玩 N 場 · 勝率 X% · 平均 ±$Y/場 · 自摸率 Z%」。

**Architecture:** 純前端 derived data。擴充 `frontend/src/lib/utils.ts` 的 `buildSettledRanking()`（現有迴圈內多累計兩個 counter），`SettledRankingEntry` 加 `roundCount` / `winRate` / `avgPerRound` 三欄位；`Dashboard.tsx` 排名列多渲染一行。不動後端 `Code.gs`、不改資料表。

**Tech Stack:** React + TypeScript + Vite（frontend/）。repo 無測試框架——邏輯以一次性 `npx tsx` assert 腳本驗證後刪除，不進 repo（spec 決議）。

**Spec:** `docs/superpowers/specs/2026-07-10-player-stats-design.md`

## Global Constraints

- 統計只計入**已結算週**的局（與卡片現有「截至 X（已結算 N 週）」口徑一致）。
- `amount ≤ 0` 不算勝；`amount > 0` 才算勝的那一局。
- `roundCount === 0` 時 `winRate`、`avgPerRound` 為 `null`（不得出現 NaN）。
- Sheets 數值可能是字串，沿用現有 `Number(...) || 0` 慣例。
- 顯示文案固定為：`已玩 {N} 場 · 勝率 {X}% · 平均 {±$Y}/場 · 自摸率 {Z}%`；0 場玩家只顯示 `已玩 0 場`。
- 百分比四捨五入為整數；金額用現有 `fmtSignedMoney`（自帶整數化）。
- 不新增 npm 依賴、不引入測試框架。

---

### Task 1: 擴充 `buildSettledRanking` 統計欄位

**Files:**
- Modify: `frontend/src/lib/utils.ts:315-393`（`SettledRankingEntry` 介面與 `buildSettledRanking` 函式）
- Test: `frontend/verify-stats.ts`（一次性驗證腳本，驗完刪除，不 commit）

**Interfaces:**
- Consumes: 既有 `buildSettledRanking(players, tsumos, rounds)`、`groupRoundsByWeek`。
- Produces: `SettledRankingEntry` 新欄位，Task 2 依賴這些確切名稱與型別：
  - `roundCount: number`
  - `winRate: number | null`（0–1 的比例，非百分比）
  - `avgPerRound: number | null`

- [ ] **Step 1: 寫失敗中的驗證腳本**

建立 `frontend/verify-stats.ts`：

```ts
import assert from "node:assert";
import { buildSettledRanking } from "./src/lib/utils";
import type { Player, Round, Tsumo } from "./src/types";

const players: Player[] = ["p1", "p2", "p3", "p4", "p5"].map((id) => ({
  id,
  name: id.toUpperCase(),
  active: true,
  created_at: "2026-06-01",
}));

// 一局 = 4 列，round_id 相同；settled: true 使該週視為已結算
const mkRound = (
  round_id: string,
  date: string,
  entries: [string, number][],
): Round[] =>
  entries.map(([player_id, amount], i) => ({
    id: `${round_id}-${i}`,
    round_id,
    date,
    player_id,
    amount,
    cut_amount: 0,
    settled: true,
    created_at: date,
  }));

const rounds: Round[] = [
  // 2026-06-29（一）、06-30（二）同屬一週，全部已結算
  ...mkRound("r1", "2026-06-29", [
    ["p1", 100],
    ["p2", -100],
    ["p3", 0],
    ["p4", 0],
  ]),
  ...mkRound("r2", "2026-06-30", [
    ["p1", 50],
    ["p2", -30],
    ["p3", -20],
    ["p4", 0],
  ]),
];

const tsumos: Tsumo[] = [
  // p5 只有自摸、沒打過局 → roundCount 0
  { id: "t1", date: "2026-06-29", player_id: "p5", count: 2, amount: 100, created_at: "2026-06-29" },
];

const { list } = buildSettledRanking(players, tsumos, rounds);
const byId = Object.fromEntries(list.map((e) => [e.id, e]));

// 情境 1：正常多局 —— p1 兩場全勝，平均 (100+50)/2 = 75
assert.equal(byId.p1.roundCount, 2);
assert.equal(byId.p1.winRate, 1);
assert.equal(byId.p1.avgPerRound, 75);

// p2 兩場全敗，平均 -65
assert.equal(byId.p2.roundCount, 2);
assert.equal(byId.p2.winRate, 0);
assert.equal(byId.p2.avgPerRound, -65);

// 情境 2：amount = 0 不算勝 —— p3 兩場（0、-20）勝率 0
assert.equal(byId.p3.roundCount, 2);
assert.equal(byId.p3.winRate, 0);

// 情境 3：0 場玩家 —— p5 只有自摸，回傳 null 而非 NaN
assert.equal(byId.p5.roundCount, 0);
assert.equal(byId.p5.winRate, null);
assert.equal(byId.p5.avgPerRound, null);

// 既有行為不變：p4 全零（winLoss/cut/tsumo 皆 0）仍被 filter 掉
assert.equal(byId.p4, undefined);

console.log("all assertions passed");
```

- [ ] **Step 2: 執行腳本，確認失敗**

Run: `cd frontend && npx tsx verify-stats.ts`
Expected: FAIL —— `AssertionError`，`byId.p1.roundCount` 為 `undefined`（欄位尚未實作）。tsx 不做型別檢查，直接跑到 assert 才失敗是正常的。

- [ ] **Step 3: 實作**

`frontend/src/lib/utils.ts` —— `SettledRankingEntry` 介面（約 line 315）加三個欄位：

```ts
export interface SettledRankingEntry {
  id: Id;
  name: string;
  winLoss: number;     // Σ rounds.amount (signed) in settled weeks
  cut: number;         // Σ rounds.cut_amount in settled weeks (winner-only)
  tsumoAmount: number; // Σ tsumos.amount whose date falls in a settled week
  tsumoCount: number;  // Σ tsumos.count in settled weeks
  net: number;         // winLoss - cut - tsumoAmount
  roundCount: number;          // 已結算週中參與的局數
  winRate: number | null;      // winCount / roundCount（0–1）；0 場為 null
  avgPerRound: number | null;  // winLoss / roundCount；0 場為 null
}
```

`buildSettledRanking()` 內，現有四個 `...ByPid` 累計器（約 line 340）旁加兩個：

```ts
  const roundCountByPid: Record<Id, number> = {};
  const winCountByPid: Record<Id, number> = {};
```

現有 settled weeks 迴圈的 row 迭代（約 line 345-353）中，`cutByPid` 那行之後加：

```ts
        roundCountByPid[pid] = (roundCountByPid[pid] ?? 0) + 1;
        if ((Number(row.amount) || 0) > 0) {
          winCountByPid[pid] = (winCountByPid[pid] ?? 0) + 1;
        }
```

`players.map<SettledRankingEntry>()`（約 line 363-378）的 return 改為：

```ts
      const roundCount = roundCountByPid[p.id] ?? 0;
      return {
        id: p.id,
        name: p.name,
        winLoss,
        cut,
        tsumoAmount,
        tsumoCount,
        net: winLoss - cut - tsumoAmount,
        roundCount,
        winRate: roundCount > 0 ? (winCountByPid[p.id] ?? 0) / roundCount : null,
        avgPerRound: roundCount > 0 ? winLoss / roundCount : null,
      };
```

（`const roundCount = ...` 放在 map callback 內既有 `const winLoss = ...` 等宣告之後。既有的 `.filter(...)` 條件**不要動**——排名成員資格維持原樣。）

- [ ] **Step 4: 執行腳本，確認通過**

Run: `cd frontend && npx tsx verify-stats.ts`
Expected: 輸出 `all assertions passed`

- [ ] **Step 5: 刪除驗證腳本並 commit**

```bash
rm frontend/verify-stats.ts
cd frontend && npx tsc --noEmit -p tsconfig.app.json
```

Expected: tsc 無錯誤輸出（exit 0）。

```bash
git add frontend/src/lib/utils.ts
git commit -m "feat: add roundCount/winRate/avgPerRound to settled ranking

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Dashboard 顯示統計行

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx:247-286`（已結算排名卡片的 `ranking.list.map` 區塊）

**Interfaces:**
- Consumes: Task 1 的 `SettledRankingEntry.roundCount: number`、`winRate: number | null`、`avgPerRound: number | null`，以及既有 `tsumoCount: number`、`fmtSignedMoney(n, symbol)`（已 import）。
- Produces: 無（純顯示，無下游依賴）。

- [ ] **Step 1: 修改渲染**

`Dashboard.tsx` 的 `ranking.list.map((p, i) => { ... })` callback 內（約 line 248），既有 `cutLabel` 宣告之後加：

```tsx
                  const statsLabel =
                    p.roundCount === 0
                      ? "已玩 0 場"
                      : [
                          `已玩 ${p.roundCount} 場`,
                          `勝率 ${Math.round((p.winRate ?? 0) * 100)}%`,
                          `平均 ${fmtSignedMoney(p.avgPerRound, symbol)}/場`,
                          `自摸率 ${Math.round((p.tsumoCount / p.roundCount) * 100)}%`,
                        ].join(" · ");
```

既有副標題行（約 line 267-270）：

```tsx
                        <div className="text-[15px] text-ink-3">
                          {winLossLabel}
                          {cutLabel ? ` · ${cutLabel}` : ""} · {tsumoLabel}
                        </div>
```

之後緊接著加一行：

```tsx
                        <div className="text-[14px] text-ink-3">{statsLabel}</div>
```

- [ ] **Step 2: 型別檢查與 build**

Run: `cd frontend && npm run build`
Expected: tsc + vite build 成功，無型別錯誤。

- [ ] **Step 3: 實際看畫面**

Run: `cd frontend && npm run dev`，瀏覽器開啟 dev server 網址。
Expected: Dashboard「已結算排名」每位玩家第二行顯示如 `已玩 12 場 · 勝率 58% · 平均 +$27/場 · 自摸率 25%`；若有只自摸沒打局的玩家，該行只顯示 `已玩 0 場`。確認後停掉 dev server。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Dashboard.tsx
git commit -m "feat: show games played, win rate, avg per round, tsumo rate in settled ranking

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
