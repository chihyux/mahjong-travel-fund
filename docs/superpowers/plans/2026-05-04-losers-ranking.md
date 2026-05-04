# 輸家榜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Dashboard 加一張「輸家榜」卡片，顯示淨輸（`Σ Round.amount < 0`）的前 10 位玩家，1~3 名用紅色徽章。

**Architecture:** 三檔小改動：(1) `lib/utils.ts` 新增 `buildLoserboard()` 純函式；(2) `components/ui/RankBadge.tsx` 新增 `variant?: 'default' | 'loser'` prop；(3) `components/Dashboard.tsx` 在贊助榜下方條件渲染新 Card。零後端改動。

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind。

**Testing approach:** 此專案沒有測試框架（package.json 無 vitest/jest 等），亦無既有測試檔。為這一個小功能引入測試框架屬 YAGNI。本計畫的驗證方式：
- `npm run typecheck` 確保 TS 通過
- `npm run build` 確保 Vite build 通過
- `npm run dev` 開瀏覽器人眼驗證各邊界條件

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `frontend/src/lib/utils.ts` | 修改 | 新增 `LoserboardEntry` 型別與 `buildLoserboard()` 純函式 |
| `frontend/src/components/ui/RankBadge.tsx` | 修改 | 新增 `variant` prop，loser 變體紅色三階徽章 |
| `frontend/src/components/Dashboard.tsx` | 修改 | import 新函式、計算 losers、條件渲染新 Card |

---

## Task 1: 新增 `buildLoserboard()` 純函式

**Files:**
- Modify: `frontend/src/lib/utils.ts`（在 `buildLeaderboard()` 之後加 export）

- [ ] **Step 1：在 `lib/utils.ts` 末尾（`sleep` 之前）新增型別與函式**

打開 `frontend/src/lib/utils.ts`，在 `export const sleep = ...` 那行**之前**插入：

```ts
// ===== 輸家榜 =====
export interface LoserboardEntry {
  id: Id;
  name: string;
  netAmount: number;   // 必為負數
  roundCount: number;  // 該玩家在 rounds 中出現的列數
}

export function buildLoserboard(
  players: Player[],
  rounds: Round[] | undefined
): LoserboardEntry[] {
  const netByPid: Record<Id, number> = {};
  const countByPid: Record<Id, number> = {};

  for (const r of rounds ?? []) {
    const pid = r.player_id;
    netByPid[pid] = (netByPid[pid] ?? 0) + (Number(r.amount) || 0);
    countByPid[pid] = (countByPid[pid] ?? 0) + 1;
  }

  return players
    .map<LoserboardEntry>((p) => ({
      id: p.id,
      name: p.name,
      netAmount: netByPid[p.id] ?? 0,
      roundCount: countByPid[p.id] ?? 0
    }))
    .filter((e) => e.netAmount < 0)
    .sort((a, b) => a.netAmount - b.netAmount)
    .slice(0, 10);
}
```

決策說明（不要寫進程式碼註解，僅供實作者理解）：
- 用 `players` 當 source 而不是直接從 `rounds` 收 `player_id`：跟 `buildLeaderboard()` 同 pattern；保證 `name` 來自 Players sheet 而非走 `playerName()` 的 fallback
- 已刪除的 player（rounds 還在，但 Players 沒這列）→ 不會上榜。這是可接受的取捨，跟 leaderboard 行為一致
- 不過濾 `active`：跟 spec 對齊（inactive 但有牌桌資料一樣算）。`buildLeaderboard` 有 `total > 0 || active` 過濾，但輸家榜的條件 `netAmount < 0` 已經夠強，不需另加 active 過濾
- 排序穩定性：JS Array.prototype.sort 在現代引擎是 stable，相同 netAmount 維持原順序（`players` 順序），不另做 tie-break

- [ ] **Step 2：執行 typecheck 確認沒打錯**

Run: `cd frontend && npm run typecheck`
Expected: 0 errors（既有檔案沒改 signature，不應有錯）

- [ ] **Step 3：commit**

```bash
git add frontend/src/lib/utils.ts
git commit -m "add buildLoserboard helper"
```

---

## Task 2: `RankBadge` 加 `variant` prop

**Files:**
- Modify: `frontend/src/components/ui/RankBadge.tsx`

- [ ] **Step 1：把 `RankBadge.tsx` 整檔換成下面內容**

```tsx
interface RankBadgeProps {
  rank: number;
  size?: number;
  variant?: 'default' | 'loser';
}

interface RankStyle {
  bg: string;
  color: string;
}

const STYLES: Record<number, RankStyle> = {
  1: { bg: '#2F4A2F', color: '#F5E9CC' },
  2: { bg: '#D9A441', color: '#FFFFFF' },
  3: { bg: '#8A8074', color: '#FFFFFF' }
};

const LOSER_STYLES: Record<number, RankStyle> = {
  1: { bg: '#7F1D1D', color: '#FEE2E2' },
  2: { bg: '#B91C1C', color: '#FFFFFF' },
  3: { bg: '#DC2626', color: '#FFFFFF' }
};

const DEFAULT_STYLE: RankStyle = { bg: '#E5E0D0', color: '#6B7A6B' };

export default function RankBadge({ rank, size = 56, variant = 'default' }: RankBadgeProps) {
  const table = variant === 'loser' ? LOSER_STYLES : STYLES;
  const s = table[rank] ?? DEFAULT_STYLE;
  const fontSize = size >= 56 ? 28 : size >= 44 ? 22 : 18;

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 num"
      style={{
        width: size,
        height: size,
        background: s.bg,
        color: s.color,
        fontSize,
        fontWeight: 900
      }}
    >
      {rank}
    </div>
  );
}
```

要點：
- 預設 `variant='default'`，既有呼叫端 `<RankBadge rank={i+1} />` 行為完全不變
- `variant='loser'` 且 `rank > 3` → 落到 `DEFAULT_STYLE` 灰底（跟原本 4 名以後一致）

- [ ] **Step 2：typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 0 errors

- [ ] **Step 3：build 確認沒語法問題**

Run: `cd frontend && npm run build`
Expected: build 成功，無錯誤

- [ ] **Step 4：commit**

```bash
git add frontend/src/components/ui/RankBadge.tsx
git commit -m "add loser variant to RankBadge"
```

---

## Task 3: Dashboard 加輸家榜 Card

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`

- [ ] **Step 1：擴充 import 拉進 `buildLoserboard`**

把 `Dashboard.tsx` 上方的 import：

```tsx
import {
  buildLeaderboard,
  calcBalance,
  fmtMoney,
  fmtRelativeDate,
  groupRoundsByWeek,
  hasUnsettledPriorWeek,
  playerName,
  weekRangeLabel,
  weekStartISO,
} from "../lib/utils";
```

改成：

```tsx
import {
  buildLeaderboard,
  buildLoserboard,
  calcBalance,
  fmtMoney,
  fmtRelativeDate,
  fmtSignedMoney,
  groupRoundsByWeek,
  hasUnsettledPriorWeek,
  playerName,
  weekRangeLabel,
  weekStartISO,
} from "../lib/utils";
```

（多 `buildLoserboard` 與 `fmtSignedMoney`，兩個都要用）

- [ ] **Step 2：在 `topN` 那行下方加上 losers 計算**

找到 `Dashboard.tsx` 內這幾行：

```tsx
const { list: leaderboard } = buildLeaderboard(players, tsumos, rounds);
const topN = leaderboard.slice(0, 10);
```

在它們**下方**新增：

```tsx
const losers = buildLoserboard(players, rounds);
```

- [ ] **Step 3：在贊助榜 Card 結尾後插入輸家榜 Card**

找到贊助榜 Card 結尾（包含 `ContributionPie` 那塊）：

```tsx
        {topN.length >= 2 && (
          <div className="mt-6 pt-6 border-t border-divider">
            <div className="text-[18px] font-medium text-ink-2 mb-3">
              貢獻占比
            </div>
            <ContributionPie data={topN} />
          </div>
        )}
      </Card>
```

在這個 `</Card>` **之後**、`{(recentTsumos.length > 0 || recentRounds.length > 0) && (` **之前**插入：

```tsx
      {losers.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-divider" />
            <span className="font-serif text-[22px] font-bold">輸家榜</span>
            <div className="flex-1 h-px bg-divider" />
          </div>

          <div className="space-y-4">
            {losers.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4">
                <RankBadge rank={i + 1} variant="loser" />
                <div className="flex-1 min-w-0">
                  <div className="text-[22px] font-medium truncate">
                    {p.name}
                  </div>
                  <div className="text-[16px] text-ink-3">
                    {p.roundCount} 局
                  </div>
                </div>
                <div className="num text-[24px] text-red-700 flex-shrink-0">
                  {fmtSignedMoney(p.netAmount, symbol)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
```

要點：
- 卡片整體樣式與贊助榜對稱（標題、分隔線、列表 spacing）
- 條件渲染 `losers.length > 0` → 0 輸家整張卡片不出現
- `RankBadge` 傳 `variant="loser"` → 1~3 名紅色，4~10 名灰色
- 金額用 `fmtSignedMoney`，自動加 `−` 號；顏色 `text-red-700` 跟週結算頁負值一致

- [ ] **Step 4：typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 0 errors

- [ ] **Step 5：build**

Run: `cd frontend && npm run build`
Expected: build 成功

- [ ] **Step 6：dev 跑起來人眼驗證**

Run: `cd frontend && npm run dev`

開 `http://localhost:5173`（或 vite 顯示的 port），檢查：

| 情境 | 預期 |
|---|---|
| 已有 rounds 資料、有人淨輸 | Dashboard 贊助榜下方出現「輸家榜」卡片，最輸的人在第 1 名（紅徽章） |
| 1~3 名 | 紅色徽章（深紅/中紅/淺紅依序） |
| 4 名以後（若有） | 灰色徽章（同贊助榜 4 名後） |
| 全員淨贏 / 沒有 rounds | 整張輸家榜卡片不渲染 |
| 訪客模式（登出） | 同樣看得到輸家榜 |
| 手機寬度 | 列表不爆版、姓名 truncate、金額不擠 |

如果某情境不符合，回 Task 3 對應 step 修正。

- [ ] **Step 7：commit**

```bash
git add frontend/src/components/Dashboard.tsx
git commit -m "show losers ranking card on dashboard"
```

---

## Self-Review

- **Spec coverage**：
  - 計算邏輯（`Σ amount`、`< 0`、升冪、top 10）→ Task 1 ✓
  - 卡片位置（贊助榜下方）→ Task 3 Step 3 ✓
  - 顯示條件（0 輸家不顯示）→ Task 3 Step 3 條件渲染 ✓
  - 每列內容（紅徽章｜姓名｜N 局｜紅字金額）→ Task 3 Step 3 ✓
  - 1~3 紅徽章、4+ 灰徽章 → Task 2 LOSER_STYLES + DEFAULT_STYLE fallback ✓
  - 訪客可見 → Task 3 Step 6 驗證 ✓
  - 不影響贊助榜 → Task 2 預設 variant 行為不變 ✓

- **Placeholder scan**：所有 step 都有具體 code / 指令，無 TBD / TODO ✓

- **Type consistency**：`LoserboardEntry` 在 Task 1 定義，Task 3 用 `p.id / p.name / p.netAmount / p.roundCount` 一致 ✓

- **副資訊樣式**：spec 說「副資訊『N 局』放在姓名下方第二行」，Task 3 Step 3 用 `text-[16px] text-ink-3` 跟贊助榜副資訊樣式一致 ✓
