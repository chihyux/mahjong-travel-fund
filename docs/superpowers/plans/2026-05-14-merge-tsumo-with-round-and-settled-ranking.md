# 合併「記錄自摸」與「每局結算」+ 已結算排名榜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the standalone "record tsumo" entry into the per-round form (locking tsumo players to the 4 round members), and replace the dashboard's loser board with a "settled ranking" computed only from already-settled weeks.

**Architecture:** Apps Script backend gains one atomic write action that records a Round (4 rows) plus 0..4 Tsumos in one call. Frontend collapses two entry screens to one, and swaps the existing `buildLoserboard` aggregation for a new `buildSettledRanking` that filters by week-level `settled=true` flag.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind; Google Apps Script (single `.gs` file) writing to a Google Sheet.

**No test framework in repo.** Verification is `npm run typecheck`, `npm run build`, and manual checks on the Vite dev server. The Apps Script side is deployed manually by the user; backend changes are verified by reading the file and running the new flow against the deployed endpoint.

---

## File Map

```
backend/Code.gs                                  # +addRoundWithTsumos action + route
frontend/src/types.ts                            # +RoundWithTsumosPayload, RoundTsumoEntry; -'addTsumo' ViewKey
frontend/src/lib/api.ts                          # +addRoundWithTsumos; -addTsumo
frontend/src/hooks/useStore.tsx                  # +addRoundWithTsumos action; -addTsumo action
frontend/src/lib/utils.ts                        # +buildSettledRanking; -buildLoserboard
frontend/src/components/AddRound.tsx             # +tsumo stepper section; +submit uses new action
frontend/src/components/AddTsumo.tsx             # DELETED
frontend/src/components/Dashboard.tsx            # -記錄自摸 button; -loserboard card; +settled ranking card
frontend/src/components/Shell.tsx                # desktop sidebar / mobile tab bar nav updates
frontend/src/App.tsx                             # remove AddTsumo import + case + ADMIN_ONLY_VIEWS entry; MoreMenu emoji
docs/superpowers/specs/2026-05-14-merge-tsumo-with-round-and-settled-ranking-design.md  # already committed
```

Backend and frontend can ship in either order but the frontend depends on the new backend action existing. Recommended order: backend first, then frontend.

---

## Task 1: Backend — add `addRoundWithTsumos` action

**Files:**
- Modify: `backend/Code.gs`

- [ ] **Step 1: Read the existing `handleAddRound` to confirm validation patterns**

Read `backend/Code.gs` lines 297–344 (current `handleAddRound`) to keep validation symmetric.

- [ ] **Step 2: Add the action to the `writeActions` whitelist**

In `backend/Code.gs`, locate the `writeActions` array (~ line 181) and add `'addRoundWithTsumos'`:

```js
const writeActions = [
  'addPlayer', 'updatePlayer', 'deletePlayer',
  'addTsumo', 'updateTsumo', 'deleteTsumo',
  'addRound', 'addRoundWithTsumos', 'updateRound', 'deleteRound', 'markWeekSettled',
  'addWithdrawal', 'deleteWithdrawal',
  'updateSettings'
];
```

- [ ] **Step 3: Add the `switch` case to dispatch**

In the `switch (action)` block (~ line 192), add the case directly under `case 'addRound':`:

```js
case 'addRound': return handleAddRound(body);
case 'addRoundWithTsumos': return handleAddRoundWithTsumos(body);
case 'updateRound': return handleUpdateRound(body);
```

- [ ] **Step 4: Implement `handleAddRoundWithTsumos`**

Add a new function below `handleAddRound` (~ after line 344):

```js
// ---- 每局結算 + 自摸（合併入口） ----
function handleAddRoundWithTsumos(body) {
  if (!body.date) return errOut('Missing date');
  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length !== 4) {
    return errOut('需要 4 位玩家');
  }

  const playerIds = entries.map(e => String((e && e.player_id) || ''));
  if (playerIds.some(id => !id)) return errOut('玩家未選齊');
  if (new Set(playerIds).size !== 4) return errOut('玩家不可重複');

  let sum = 0;
  const normalizedEntries = entries.map(e => {
    const amt = Number(e.amount);
    if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
      throw new Error('amount 需為整數');
    }
    sum += amt;
    return { player_id: String(e.player_id), amount: amt };
  });
  if (sum !== 0) return errOut('輸贏總和需為 0');
  if (normalizedEntries.every(e => e.amount === 0)) return errOut('金額全為 0');

  const tsumosInput = Array.isArray(body.tsumos) ? body.tsumos : [];
  const playerIdSet = new Set(playerIds);
  const seenTsumoPids = new Set();
  const normalizedTsumos = tsumosInput.map(t => {
    if (!t || typeof t !== 'object') throw new Error('tsumo 格式錯誤');
    const pid = String(t.player_id || '');
    if (!pid) throw new Error('tsumo player_id 不可空白');
    if (!playerIdSet.has(pid)) throw new Error('tsumo player 必須是本局玩家');
    if (seenTsumoPids.has(pid)) throw new Error('tsumo player 不可重複');
    seenTsumoPids.add(pid);
    const count = Number(t.count);
    if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
      throw new Error('tsumo count 需為正整數');
    }
    return { player_id: pid, count: count };
  });

  const roundId = newId('rnd');
  const date = String(body.date);
  const note = String(body.note || '');
  const now = nowIso();
  const cutRatio = currentCutRatio();
  const tsumoUnit = currentTsumoAmount();

  normalizedEntries.forEach(e => {
    const cut = e.amount > 0 ? Math.round(e.amount * cutRatio) : 0;
    appendRow(SHEET_ROUNDS, {
      id: newId('r'),
      round_id: roundId,
      date: date,
      player_id: e.player_id,
      amount: e.amount,
      cut_amount: cut,
      settled: false,
      settled_at: '',
      note: note,
      created_at: now
    });
  });

  const tsumoIds = [];
  normalizedTsumos.forEach(t => {
    const tid = newId('t');
    appendRow(SHEET_TSUMOS, {
      id: tid,
      date: date,
      player_id: t.player_id,
      count: t.count,
      amount: tsumoUnit * t.count,
      note: '',
      created_at: now
    });
    tsumoIds.push(tid);
  });

  return okOut({ round_id: roundId, tsumo_ids: tsumoIds });
}
```

- [ ] **Step 5: Visually verify the file structure**

Open `backend/Code.gs` and confirm:
1. `'addRoundWithTsumos'` appears in the `writeActions` array.
2. There is exactly one `case 'addRoundWithTsumos':` line in `doPost`.
3. The new `handleAddRoundWithTsumos` function exists once.

- [ ] **Step 6: Commit**

```bash
git add backend/Code.gs
git commit -m "$(cat <<'EOF'
add backend action to record a round with its tsumos atomically

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

> **Manual step for the user (not done by the agent):** Push the new code via Apps Script → 管理部署 → 編輯 → 新版本. The endpoint URL stays the same. Until this is done, the frontend's new submit will fail with "Unknown action".

---

## Task 2: Frontend types — add payload types, remove `addTsumo` ViewKey

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add the new payload types**

In `frontend/src/types.ts`, find the `// ===== Action payloads =====` section and add directly under the existing `RoundPayload` definition:

```ts
export interface RoundTsumoEntry {
  player_id: Id;
  count: number;
}

export interface RoundWithTsumosPayload {
  date: IsoDate;
  entries: RoundEntry[];           // 必須恰好 4 筆，玩家不重複，amount 總和 = 0
  tsumos: RoundTsumoEntry[];       // 0..4 筆，count > 0，player_id 必屬 entries
  note?: string;
}
```

- [ ] **Step 2: Remove `'addTsumo'` from `ViewKey`**

Find the `ViewKey` union near the bottom of the file:

```ts
export type ViewKey =
  | 'dashboard'
  | 'history'
  | 'login'
  | 'addTsumo'
  | 'addRound'
  | 'weeklySettlements'
  | 'players'
  | 'withdrawals'
  | 'settings'
  | 'more';
```

Change to:

```ts
export type ViewKey =
  | 'dashboard'
  | 'history'
  | 'login'
  | 'addRound'
  | 'weeklySettlements'
  | 'players'
  | 'withdrawals'
  | 'settings'
  | 'more';
```

- [ ] **Step 3: Verify the file still parses (typecheck will catch downstream regressions in later tasks)**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected output: TypeScript errors in files that still reference `'addTsumo'` (App.tsx, Shell.tsx, useStore.tsx, etc.). That's intentional — those will be fixed in later tasks. The types.ts file itself should have no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts
git commit -m "$(cat <<'EOF'
add RoundWithTsumosPayload type, drop addTsumo ViewKey

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: API client — add `addRoundWithTsumos`, remove `addTsumo`

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update the imports**

Replace the `import type { ... }` block at the top of `frontend/src/lib/api.ts`:

```ts
import type {
  ApiResponse,
  AppData,
  Id,
  PlayerUpdatePayload,
  RoundPayload,
  RoundWithTsumosPayload,
  SettingsMap,
  TsumoUpdatePayload,
  WithdrawalPayload
} from '../types';
```

(Removed: `TsumoPayload`. Added: `RoundWithTsumosPayload`. `TsumoUpdatePayload` stays — `updateTsumo` is still used by the history page.)

- [ ] **Step 2: Replace the api object methods**

In the same file, replace the `addTsumo` line and add `addRoundWithTsumos` under `addRound`. The final `api` object should read:

```ts
export const api = {
  getAll: () => get<AppData>({ action: 'getAll' }),
  login: (password: string) => post<unknown>({ action: 'login', password }),

  addPlayer: (password: string, name: string) =>
    post<unknown>({ action: 'addPlayer', password, name }),
  updatePlayer: (password: string, payload: PlayerUpdatePayload) =>
    post<unknown>({ action: 'updatePlayer', password, ...payload }),
  deletePlayer: (password: string, id: Id) =>
    post<unknown>({ action: 'deletePlayer', password, id }),

  updateTsumo: (password: string, payload: TsumoUpdatePayload) =>
    post<unknown>({ action: 'updateTsumo', password, ...payload }),
  deleteTsumo: (password: string, id: Id) =>
    post<unknown>({ action: 'deleteTsumo', password, id }),

  addRound: (password: string, payload: RoundPayload) =>
    post<unknown>({ action: 'addRound', password, ...payload }),
  addRoundWithTsumos: (password: string, payload: RoundWithTsumosPayload) =>
    post<unknown>({ action: 'addRoundWithTsumos', password, ...payload }),
  deleteRound: (password: string, round_id: Id) =>
    post<unknown>({ action: 'deleteRound', password, round_id }),
  markWeekSettled: (password: string, week_start: string, settled: boolean) =>
    post<unknown>({ action: 'markWeekSettled', password, week_start, settled }),

  addWithdrawal: (password: string, payload: WithdrawalPayload) =>
    post<unknown>({ action: 'addWithdrawal', password, ...payload }),
  deleteWithdrawal: (password: string, id: Id) =>
    post<unknown>({ action: 'deleteWithdrawal', password, id }),

  updateSettings: (password: string, settings: Partial<SettingsMap>) =>
    post<unknown>({ action: 'updateSettings', password, settings })
};
```

(Removed: the `addTsumo` method. `addRound` is kept — `addRoundWithTsumos` is a *separate* action; we are not deleting `addRound` because some tests / future flows may still want a no-tsumo variant. Both are valid.)

Actually, since the new merged form sends `tsumos: []` when no one tsumo'd, `addRoundWithTsumos` fully supersedes `addRound`. We *could* remove `addRound`, but it's still referenced by Apps Script for backward compat and frontend types still have `RoundPayload`. Decision: **keep `addRound` API method for now** (no caller in frontend after this task, but it's safe dead code that costs one line).

- [ ] **Step 3: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: only `useStore.tsx` errors (still references `api.addTsumo`). Other files should not have new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
add addRoundWithTsumos api client, drop addTsumo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Store action — wire `addRoundWithTsumos`, drop `addTsumo`

**Files:**
- Modify: `frontend/src/hooks/useStore.tsx`

- [ ] **Step 1: Update the type imports at the top**

Replace the imports from `'../types'` to drop `TsumoPayload` and add `RoundWithTsumosPayload`:

```ts
import {
  ApiError,
  type AppData,
  type Id,
  type PlayerUpdatePayload,
  type RoundPayload,
  type RoundWithTsumosPayload,
  type SettingsMap,
  type ToastMessage,
  type ToastType,
  type TsumoUpdatePayload,
  type WithdrawalPayload
} from '../types';
```

- [ ] **Step 2: Update the `StoreActions` interface**

Find the `interface StoreActions` block and replace it:

```ts
interface StoreActions {
  login: (pw: string) => Promise<boolean>;
  logout: () => void;

  addPlayer: (name: string) => Promise<unknown>;
  updatePlayer: (payload: PlayerUpdatePayload) => Promise<unknown>;
  deletePlayer: (id: Id) => Promise<unknown>;

  updateTsumo: (payload: TsumoUpdatePayload) => Promise<unknown>;
  deleteTsumo: (id: Id) => Promise<unknown>;

  addRound: (payload: RoundPayload) => Promise<unknown>;
  addRoundWithTsumos: (payload: RoundWithTsumosPayload) => Promise<unknown>;
  deleteRound: (round_id: Id) => Promise<unknown>;
  markWeekSettled: (weekStart: string, settled: boolean) => Promise<unknown>;

  addWithdrawal: (payload: WithdrawalPayload) => Promise<unknown>;
  deleteWithdrawal: (id: Id) => Promise<unknown>;

  updateSettings: (settings: Partial<SettingsMap>) => Promise<unknown>;

  refresh: () => Promise<void>;
  showToast: (msg: string, type?: ToastType) => void;
}
```

(Removed: `addTsumo`. Added: `addRoundWithTsumos`.)

- [ ] **Step 3: Update the `actions` object**

In the `const actions: StoreActions = { ... }` block, remove the `addTsumo` line and add `addRoundWithTsumos`. The relevant section should read:

```ts
    updateTsumo: wrap(
      (pw, payload: TsumoUpdatePayload) => api.updateTsumo(pw, payload),
      '已更新'
    ),
    deleteTsumo: wrap((pw, id: Id) => api.deleteTsumo(pw, id), '已刪除'),

    addRound: wrap(
      (pw, payload: RoundPayload) => api.addRound(pw, payload),
      '已記錄本局'
    ),
    addRoundWithTsumos: wrap(
      (pw, payload: RoundWithTsumosPayload) => api.addRoundWithTsumos(pw, payload),
      '已記錄本局'
    ),
    deleteRound: wrap((pw, round_id: Id) => api.deleteRound(pw, round_id), '已刪除'),
```

- [ ] **Step 4: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: errors only in `App.tsx`, `Shell.tsx`, `Dashboard.tsx`, `AddTsumo.tsx` referencing the dropped ViewKey `'addTsumo'`. `useStore.tsx` itself should have no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useStore.tsx
git commit -m "$(cat <<'EOF'
wire addRoundWithTsumos store action, drop addTsumo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Utils — add `buildSettledRanking`, remove `buildLoserboard`

**Files:**
- Modify: `frontend/src/lib/utils.ts`

- [ ] **Step 1: Add the new function and types**

Open `frontend/src/lib/utils.ts`. Find the existing `// ===== 輸家榜 =====` section (around line 325) and replace the entire section (from `// ===== 輸家榜 =====` through the closing of `buildLoserboard`) with:

```ts
// ===== 已結算排名榜 =====
export interface SettledRankingEntry {
  id: Id;
  name: string;
  winLoss: number;     // Σ rounds.amount (signed) in settled weeks
  cut: number;         // Σ rounds.cut_amount in settled weeks (winner-only)
  tsumoAmount: number; // Σ tsumos.amount whose date falls in a settled week
  tsumoCount: number;  // Σ tsumos.count in settled weeks
  net: number;         // winLoss - cut - tsumoAmount
}

export interface SettledRanking {
  list: SettledRankingEntry[];        // sorted by net desc
  cutoffISO: string | null;           // latest settled week's Sunday (weekStart + 6); null if none
  settledWeekCount: number;
}

export function buildSettledRanking(
  players: Player[],
  tsumos: Tsumo[] | undefined,
  rounds: Round[] | undefined
): SettledRanking {
  const weeks = groupRoundsByWeek(rounds);
  const settledWeeks = weeks.filter((w) => w.settled);
  const settledWeekStarts = new Set(settledWeeks.map((w) => w.weekStart));

  const winLossByPid: Record<Id, number> = {};
  const cutByPid: Record<Id, number> = {};
  const tsumoAmountByPid: Record<Id, number> = {};
  const tsumoCountByPid: Record<Id, number> = {};

  for (const w of settledWeeks) {
    for (const g of w.rounds) {
      for (const row of g.rows) {
        const pid = row.player_id;
        winLossByPid[pid] = (winLossByPid[pid] ?? 0) + (Number(row.amount) || 0);
        cutByPid[pid] = (cutByPid[pid] ?? 0) + (Number(row.cut_amount) || 0);
      }
    }
  }

  for (const t of tsumos ?? []) {
    const wk = weekStartISO(t.date);
    if (!wk || !settledWeekStarts.has(wk)) continue;
    const pid = t.player_id;
    tsumoAmountByPid[pid] = (tsumoAmountByPid[pid] ?? 0) + (Number(t.amount) || 0);
    tsumoCountByPid[pid] = (tsumoCountByPid[pid] ?? 0) + (Number(t.count) || 1);
  }

  const list = players
    .map<SettledRankingEntry>((p) => {
      const winLoss = winLossByPid[p.id] ?? 0;
      const cut = cutByPid[p.id] ?? 0;
      const tsumoAmount = tsumoAmountByPid[p.id] ?? 0;
      const tsumoCount = tsumoCountByPid[p.id] ?? 0;
      return {
        id: p.id,
        name: p.name,
        winLoss,
        cut,
        tsumoAmount,
        tsumoCount,
        net: winLoss - cut - tsumoAmount
      };
    })
    .filter((e) => e.winLoss !== 0 || e.cut !== 0 || e.tsumoAmount !== 0)
    .sort((a, b) => b.net - a.net);

  // latest settled week's Sunday = weekStart + 6 days, in 'YYYY-MM-DD'
  let cutoffISO: string | null = null;
  if (settledWeeks.length > 0) {
    const latest = settledWeeks
      .map((w) => w.weekStart)
      .sort()           // ascending lexicographic on 'YYYY-MM-DD' == chronological
      .at(-1)!;
    cutoffISO = dayjs(latest).add(6, 'day').format('YYYY-MM-DD');
  }

  return { list, cutoffISO, settledWeekCount: settledWeeks.length };
}
```

(`dayjs` is already imported at the top of the file. `Player`, `Round`, `Tsumo`, `Id` are already imported from `'../types'`.)

- [ ] **Step 2: Verify `buildLoserboard` is fully removed**

Run from the project root:

```bash
grep -n "buildLoserboard\|LoserboardEntry" frontend/src/lib/utils.ts
```

Expected: no output (the section is gone).

- [ ] **Step 3: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: `Dashboard.tsx` will still error because it imports `buildLoserboard`. Fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/utils.ts
git commit -m "$(cat <<'EOF'
add buildSettledRanking, remove buildLoserboard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `AddRound.tsx` to include the tsumo section

**Files:**
- Modify: `frontend/src/components/AddRound.tsx`

This is the biggest single change. We do it in two commits: first add the tsumo state + UI section, then wire the new submit action.

- [ ] **Step 1: Update imports**

At the top of `frontend/src/components/AddRound.tsx`, change the imports to add `Stepper`:

```ts
import { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  asBool,
  fmtMoney,
  fmtSignedMoney,
  playerName,
  roundCutFor,
  todayISO,
  validateRoundEntries
} from '../lib/utils';
import type { Id, Player } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Stepper from './ui/Stepper';
```

- [ ] **Step 2: Add tsumo state and per-slot effect**

Inside the `AddRound` component, locate the existing state declarations (after `setSlots`) and add:

```tsx
const tsumoUnit = Number(settings.tsumo_amount) || 30;

const [tsumoCounts, setTsumoCounts] = useState<Record<Id, number>>({});

const selectedPlayerIds = useMemo(
  () => slots.map((s) => s.player_id).filter((x): x is Id => !!x),
  [slots]
);
const allFour = selectedPlayerIds.length === 4;

// 玩家從某 slot 被換掉 → 清除舊 player 的 tsumo count
const setSlotPlayer = (idx: number, newPid: Id) => {
  setSlots((prev) => {
    const oldPid = prev[idx]?.player_id ?? null;
    const next = prev.map((s, i) => (i === idx ? { ...s, player_id: newPid } : s));
    if (oldPid && oldPid !== newPid) {
      const stillUsed = next.some((s) => s.player_id === oldPid);
      if (!stillUsed) {
        setTsumoCounts((tc) => {
          if (tc[oldPid] === undefined) return tc;
          const copy = { ...tc };
          delete copy[oldPid];
          return copy;
        });
      }
    }
    return next;
  });
};

const tsumoCutTotal = useMemo(
  () =>
    selectedPlayerIds.reduce(
      (sum, pid) => sum + tsumoUnit * (tsumoCounts[pid] ?? 0),
      0
    ),
  [selectedPlayerIds, tsumoCounts, tsumoUnit]
);

const fundTotal = cutTotal + tsumoCutTotal;
```

> Note: `cutTotal` already exists in the current component. Make sure your new `fundTotal` line is placed *after* the existing `cutTotal` `useMemo`.

- [ ] **Step 3: Replace player picker `onPick` to use `setSlotPlayer`**

Find the `<PlayerPickerModal>` JSX at the bottom of the component:

```tsx
<PlayerPickerModal
  open={pickerFor !== null}
  players={activePlayers}
  takenIds={pickerFor !== null ? pickerTaken(pickerFor) : new Set()}
  onPick={(id) => {
    if (pickerFor !== null) setSlot(pickerFor, { player_id: id });
    setPickerFor(null);
  }}
  onClose={() => setPickerFor(null)}
/>
```

Replace the `onPick` callback so it uses the new `setSlotPlayer` helper:

```tsx
<PlayerPickerModal
  open={pickerFor !== null}
  players={activePlayers}
  takenIds={pickerFor !== null ? pickerTaken(pickerFor) : new Set()}
  onPick={(id) => {
    if (pickerFor !== null) setSlotPlayer(pickerFor, id);
    setPickerFor(null);
  }}
  onClose={() => setPickerFor(null)}
/>
```

- [ ] **Step 4: Insert the tsumo section JSX**

Find the existing `<div>` wrapping the four player slots (the block ending with the hint text `贏家選「+」、輸家選「−」`). Directly after that closing `</div>` and *before* the "備註（選填）" block, insert the tsumo section:

```tsx
<div>
  <label className="block text-[18px] font-medium mb-2">自摸（選填）</label>
  <div className="text-[14px] text-ink-3 mb-3">
    {allFour
      ? '該局誰自摸了幾次？沒人自摸就保持 0'
      : '請先選齊 4 位玩家'}
  </div>
  <div
    aria-disabled={!allFour}
    className={`space-y-3 ${allFour ? '' : 'opacity-50 pointer-events-none'}`}
  >
    {selectedPlayerIds.map((pid) => {
      const count = tsumoCounts[pid] ?? 0;
      return (
        <div key={pid} className="flex items-center gap-3">
          <div className="flex-1 min-w-0 text-[17px] truncate">
            {playerName(players, pid)}
          </div>
          <div className="w-40">
            <Stepper
              value={count}
              onChange={(v) =>
                setTsumoCounts((prev) => ({ ...prev, [pid]: v }))
              }
              min={0}
              max={9}
            />
          </div>
          <div className="w-20 text-right num text-[16px] text-ink-3">
            {fmtMoney(tsumoUnit * count, symbol)}
          </div>
        </div>
      );
    })}
    {!allFour && (
      <div className="text-[14px] text-ink-3">（4 人選齊後解鎖）</div>
    )}
  </div>
</div>
```

- [ ] **Step 5: Update the 結算明細 block to show tsumo + new total**

Find the existing 結算明細 block (the `<div className="p-5 rounded-2xl bg-honey/10 ...">`). Replace its inner content to:

```tsx
<div className="p-5 rounded-2xl bg-honey/10 border-2 border-honey/30 space-y-3">
  <div className="flex items-center justify-between">
    <span className="text-[16px] font-medium">差額</span>
    <span
      className={`num text-[20px] ${
        validation.diff === 0 ? 'text-sage-deep' : 'text-red-700'
      }`}
    >
      {validation.diff === 0 ? '0 ✓' : fmtSignedMoney(validation.diff, symbol)}
    </span>
  </div>

  {(winners.length > 0 || losers.length > 0) && (
    <div className="text-[14px] text-ink-2 space-y-1">
      {winners.length > 0 && (
        <div>
          贏家：
          {winners
            .map((w) => {
              const p = slots.find((s) => s.player_id === w.player_id);
              const name = p?.player_id
                ? playerName(players, p.player_id)
                : '';
              return `${name} ${fmtSignedMoney(w.amount, symbol)}`;
            })
            .join('、')}
        </div>
      )}
      {losers.length > 0 && (
        <div>
          輸家：
          {losers
            .map((l) => {
              const p = slots.find((s) => s.player_id === l.player_id);
              const name = p?.player_id
                ? playerName(players, p.player_id)
                : '';
              return `${name} ${fmtSignedMoney(l.amount, symbol)}`;
            })
            .join('、')}
        </div>
      )}
    </div>
  )}

  <div className="pt-2 border-t border-honey/30 space-y-1">
    <div className="flex items-baseline justify-between">
      <span className="text-[15px] text-ink-2">抽成</span>
      <span className="num text-[18px] text-honey">
        {fmtMoney(cutTotal, symbol)}
      </span>
    </div>
    <div className="flex items-baseline justify-between">
      <span className="text-[15px] text-ink-2">自摸</span>
      <span className="num text-[18px] text-honey">
        {fmtMoney(tsumoCutTotal, symbol)}
      </span>
    </div>
    <div className="flex items-baseline justify-between pt-2 border-t border-honey/30">
      <span className="text-[16px] text-honey font-medium">入公基金合計</span>
      <span className="num text-[28px] text-honey">
        {fmtMoney(fundTotal, symbol)}
      </span>
    </div>
    <div className="text-[13px] text-ink-3 mt-1">
      抽成：贏家金額 {Math.round(cutRatio * 100)}%；自摸：每次 {fmtMoney(tsumoUnit, symbol)}
    </div>
  </div>

  {!validation.ok && validation.reason && (
    <div className="text-[14px] text-red-700">⚠ {validation.reason}</div>
  )}
</div>
```

- [ ] **Step 6: Update `submit()` to call the new action**

Find the current `submit` function:

```tsx
const submit = async () => {
  if (!validation.ok) return;
  setBusy(true);
  try {
    await actions.addRound({
      date,
      entries: slots.map((s) => ({
        player_id: s.player_id as Id,
        amount: signedAmount(s)
      })),
      note
    });
    onDone();
  } catch {
    setBusy(false);
  }
};
```

Replace with:

```tsx
const submit = async () => {
  if (!validation.ok) return;
  setBusy(true);
  try {
    const tsumosPayload = selectedPlayerIds
      .map((pid) => ({ player_id: pid, count: tsumoCounts[pid] ?? 0 }))
      .filter((t) => t.count > 0);
    await actions.addRoundWithTsumos({
      date,
      entries: slots.map((s) => ({
        player_id: s.player_id as Id,
        amount: signedAmount(s)
      })),
      tsumos: tsumosPayload,
      note
    });
    onDone();
  } catch {
    setBusy(false);
  }
};
```

- [ ] **Step 7: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: errors only in `App.tsx`, `Shell.tsx`, `Dashboard.tsx`, and the orphaned `AddTsumo.tsx`. `AddRound.tsx` itself should have no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/AddRound.tsx
git commit -m "$(cat <<'EOF'
merge tsumo entry into per-round form

Adds 4-player locked stepper section below the win/loss inputs; submits round + tsumos in one atomic call.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Dashboard — drop 自摸 button, replace loser board with settled ranking

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`

- [ ] **Step 1: Update imports**

At the top of `frontend/src/components/Dashboard.tsx`, replace the imports from `'../lib/utils'`:

```ts
import {
  buildLeaderboard,
  buildSettledRanking,
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

(Replaced: `buildLoserboard` → `buildSettledRanking`.)

- [ ] **Step 2: Replace the `losers` computation**

In the `Dashboard` function body, find:

```tsx
const losers = buildLoserboard(players, tsumos, rounds);
```

Replace with:

```tsx
const ranking = buildSettledRanking(players, tsumos, rounds);
```

- [ ] **Step 3: Remove the 自摸 button from the admin action grid**

Locate the admin action grid (`{isAdmin && (...)}` Card block) and remove the `🀄 記錄自摸` button:

Before:
```tsx
{isAdmin && (
  <Card>
    <div className="grid gap-3">
      <Button icon="🀄" onClick={() => onNav("addTsumo")}>
        記錄自摸
      </Button>
      <Button icon="💰" variant="honey" onClick={() => onNav("addRound")}>
        每局結算
      </Button>
      ...
```

After:
```tsx
{isAdmin && (
  <Card>
    <div className="grid gap-3">
      <Button icon="💰" variant="honey" onClick={() => onNav("addRound")}>
        每局結算
      </Button>
      ...
```

(Just delete the `🀄 記錄自摸` button. The remaining 「週結算」 and 「記錄旅遊支出」 buttons stay.)

- [ ] **Step 4: Replace the 輸家榜 Card with the 已結算排名 Card**

Locate the entire 輸家榜 block:

```tsx
{losers.length > 0 && (
  <Card>
    <div className="flex items-center gap-3 mb-2">
      <div className="flex-1 h-px bg-divider" />
      <span className="font-serif text-[22px] font-bold">輸家榜</span>
      <div className="flex-1 h-px bg-divider" />
    </div>
    <div className="text-[14px] text-ink-3 text-center mb-5">
      僅計每局結算輸贏，自摸不計入
    </div>
    ...
  </Card>
)}
```

Replace it entirely with:

```tsx
{ranking.settledWeekCount === 0 ? (
  rounds.length > 0 && (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-divider" />
        <span className="font-serif text-[22px] font-bold">已結算排名</span>
        <div className="flex-1 h-px bg-divider" />
      </div>
      <div className="text-center py-8 text-ink-3 text-[15px]">
        尚無已結算資料，去「週結算」標記後會出現排名
      </div>
    </Card>
  )
) : (
  ranking.list.length > 0 && (
    <Card>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-px bg-divider" />
        <span className="font-serif text-[22px] font-bold">已結算排名</span>
        <div className="flex-1 h-px bg-divider" />
      </div>
      <div className="text-[14px] text-ink-3 text-center mb-5">
        截至 {fmtMDFromISO(ranking.cutoffISO!)}（已結算 {ranking.settledWeekCount} 週）
      </div>
      <div className="space-y-4">
        {ranking.list.map((p, i) => {
          const winLoss = p.winLoss;
          const winLossLabel =
            winLoss > 0
              ? `贏 ${fmtMoney(winLoss, symbol)}`
              : winLoss < 0
                ? `輸 ${fmtMoney(Math.abs(winLoss), symbol)}`
                : '持平';
          const tsumoLabel =
            p.tsumoCount > 0
              ? `自摸 ${p.tsumoCount} 次 ${fmtMoney(p.tsumoAmount, symbol)}`
              : '自摸 0';
          const cutLabel = p.cut > 0 ? `抽成 ${fmtMoney(p.cut, symbol)}` : null;

          return (
            <div key={p.id} className="flex items-center gap-4">
              <RankBadge rank={i + 1} />
              <div className="flex-1 min-w-0">
                <div className="text-[22px] font-medium truncate">{p.name}</div>
                <div className="text-[15px] text-ink-3">
                  {winLossLabel}
                  {cutLabel ? ` · ${cutLabel}` : ''} · {tsumoLabel}
                </div>
              </div>
              <div
                className={`num text-[24px] flex-shrink-0 ${
                  p.net > 0
                    ? 'text-sage-deep'
                    : p.net < 0
                      ? 'text-red-700'
                      : 'text-ink-3'
                }`}
              >
                {fmtSignedMoney(p.net, symbol)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  )
)}
```

- [ ] **Step 5: Add the small date helper inside the file**

Add this near the top of `Dashboard.tsx` (after the imports, before the component) — `dayjs` is already a project dependency:

```ts
import dayjs from "dayjs";

function fmtMDFromISO(iso: string): string {
  return dayjs(iso).format("M/D");
}
```

If `dayjs` is not yet imported in this file, add `import dayjs from "dayjs";` at the top.

- [ ] **Step 6: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: only `App.tsx` and `AddTsumo.tsx` and `Shell.tsx` errors remain.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Dashboard.tsx
git commit -m "$(cat <<'EOF'
replace loser board with settled-only ranking and drop tsumo button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Shell — update sidebar & mobile tab bar

**Files:**
- Modify: `frontend/src/components/Shell.tsx`

- [ ] **Step 1: Update `ADMIN_NAV` (mobile tab bar)**

In `frontend/src/components/Shell.tsx`, find the `ADMIN_NAV` constant:

```ts
const ADMIN_NAV: ReadonlyArray<NavEntry> = [
  { key: "dashboard", icon: "🌿", label: "首頁" },
  { key: "addTsumo", icon: "🀄", label: "自摸" },
  { key: "history", icon: "📖", label: "紀錄" },
  { key: "more", icon: "☰", label: "更多" },
];
```

Replace with:

```ts
const ADMIN_NAV: ReadonlyArray<NavEntry> = [
  { key: "dashboard", icon: "🌿", label: "首頁" },
  { key: "addRound", icon: "🀄", label: "每局結算" },
  { key: "history", icon: "📖", label: "紀錄" },
  { key: "more", icon: "☰", label: "更多" },
];
```

- [ ] **Step 2: Remove the 「記錄自摸」 NavItem from the desktop sidebar**

Find the admin section of the desktop sidebar (`{isAdmin ? (...)}`). Remove the `🀄 記錄自摸` NavItem block:

```tsx
<NavItem
  icon="🀄"
  label="記錄自摸"
  active={current === "addTsumo"}
  onClick={() => onNav("addTsumo")}
/>
```

So the admin sidebar starts with the divider then `每局結算`, `旅遊支出`, `玩家`, `設定`.

- [ ] **Step 3: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: errors only in `App.tsx` and `AddTsumo.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Shell.tsx
git commit -m "$(cat <<'EOF'
swap mobile tab bar slot from 自摸 to 每局結算 and drop sidebar 記錄自摸

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: App.tsx — drop AddTsumo wiring

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove the `AddTsumo` import**

Find:

```ts
import AddTsumo from "./components/AddTsumo";
```

Delete that line.

- [ ] **Step 2: Update `ADMIN_ONLY_VIEWS`**

Find:

```ts
const ADMIN_ONLY_VIEWS: ReadonlyArray<ViewKey> = [
  "addTsumo",
  "addRound",
  "players",
  "withdrawals",
  "settings",
  "more",
];
```

Remove the `"addTsumo"` line.

- [ ] **Step 3: Remove the `addTsumo` case from `renderView`**

Find:

```ts
case "addTsumo":
  return <AddTsumo onDone={() => setView("dashboard")} />;
```

Delete those two lines.

- [ ] **Step 4: Update `MoreMenu` items**

Find:

```ts
const items: ReadonlyArray<MoreMenuItem> = [
  { key: "addRound", icon: "💰", label: "每局結算" },
  ...
];
```

Change the first item's emoji to keep visual parity with the new tab bar entry:

```ts
const items: ReadonlyArray<MoreMenuItem> = [
  { key: "addRound", icon: "🀄", label: "每局結算" },
  { key: "weeklySettlements", icon: "📅", label: "週結算" },
  { key: "withdrawals", icon: "🧳", label: "旅遊支出" },
  { key: "players", icon: "👥", label: "玩家管理" },
  { key: "settings", icon: "⚙️", label: "設定" },
];
```

- [ ] **Step 5: Run typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: the only remaining error is "Cannot find module './components/AddTsumo'" or similar — because the file still exists but no one imports it. We delete it in the next task.

If errors persist, read them and fix before commit.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
drop AddTsumo from App routing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Delete `AddTsumo.tsx`

**Files:**
- Delete: `frontend/src/components/AddTsumo.tsx`

- [ ] **Step 1: Confirm there are no references**

Run from project root:

```bash
grep -rn "AddTsumo\|addTsumo" frontend/src
```

Expected: zero matches. If anything remains, fix that file before proceeding (it should not reach this task with live references).

- [ ] **Step 2: Delete the file**

```bash
rm frontend/src/components/AddTsumo.tsx
```

- [ ] **Step 3: Run typecheck and build**

From `frontend/`:

```bash
npm run typecheck && npm run build
```

Expected: clean exit (no errors). The build should produce `dist/`.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/components/AddTsumo.tsx
git commit -m "$(cat <<'EOF'
delete obsolete AddTsumo component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Note: `git add -A` is used here because `rm` already removed the file; `-A` stages the deletion.)

---

## Task 11: Manual verification

The implementation is complete. Before declaring done, drive the app through every flow.

> **Prerequisite:** The user must have already deployed the updated `backend/Code.gs` to their Apps Script project (see Task 1's manual step). Without that, every submit will fail with "Unknown action: addRoundWithTsumos".

- [ ] **Step 1: Start the dev server**

From `frontend/`:

```bash
npm run dev
```

Open the printed local URL.

- [ ] **Step 2: Log in as admin**

Use the admin password (default `1234` per `sheet-template/README.md`, but the user may have changed it).

- [ ] **Step 3: Verify the navigation no longer offers 記錄自摸**

- Mobile tab bar (resize browser narrow): 4 slots = 首頁 / 每局結算 / 紀錄 / 更多
- Desktop sidebar: no 「記錄自摸」 item; 「每局結算」 present
- Dashboard admin grid: no 「記錄自摸」 button; 「每局結算」 button present
- 更多 → no 「記錄自摸」 item

- [ ] **Step 4: Test the merged form — no-tsumo case**

1. Nav to 每局結算.
2. Pick 4 players with one winner (+100) and three losers (-30 / -30 / -40).
3. Confirm the 自摸 section is *enabled* and shows 4 rows with stepper at 0.
4. Leave all tsumo steppers at 0.
5. 結算明細 should show 抽成 $10, 自摸 $0, 入公基金合計 $10.
6. Submit. Toast: 「已記錄本局」.
7. Dashboard → 累計收入 increased by $10, recent activity shows the round.

- [ ] **Step 5: Test the merged form — partial tsumo case**

1. Nav to 每局結算 again.
2. Pick 4 different players: +200 / -50 / -50 / -100.
3. Bump player A's tsumo stepper to 1 and player B's to 2.
4. 結算明細: 抽成 $20, 自摸 $90, 入公基金合計 $110.
5. Submit. Toast: 「已記錄本局」.
6. 紀錄 → 自摸 tab: 2 new entries (player A ×1, player B ×2), same date as round.
7. 紀錄 → 局 tab: 1 new round group with 4 rows.

- [ ] **Step 6: Test the lock behavior**

1. Nav to 每局結算 (fresh).
2. Only pick 2 players. The 自摸 section should be visibly disabled (opacity ~50%, pointer-events-none, hint "請先選齊 4 位玩家").
3. Pick the remaining 2. The section becomes enabled, listing all 4 names.
4. Change one of the 4 to a different player (via player picker). The replaced player's tsumo count (if any) should be cleared from `tsumoCounts` — re-open the dropdown and verify there's no leftover count for the removed player. (This is internal state; you can verify by switching back: stepper should read 0.)

- [ ] **Step 7: Test the validation rejection**

1. Try to submit with sum ≠ 0 → button is disabled, "輸贏總和需為 0" shown.
2. Try with 4 zeros → button disabled (validation requires non-zero entries).

- [ ] **Step 8: Test 已結算排名榜**

1. 週結算 → standstill: any past week with 未結算 status? Mark the current/most recent week as 已結算.
2. Dashboard: 已結算排名 Card appears.
3. Verify each row's副標:
   - Winners show "贏 $X · 抽成 $Y · 自摸 ..."
   - Losers show "輸 $X · 自摸 ..."
4. Verify rank order: highest `net` on top.
5. Verify "截至 M/D（已結算 N 週）" header.
6. Sanity check one player: compute by hand `winLoss − cut − tsumoAmount` and verify it matches the right-side number.
7. 取消結算 the week. Refresh Dashboard. If this was the only settled week → empty state "尚無已結算資料". If others remain settled → ranking updates without this week's contribution.

- [ ] **Step 9: Verify week 結算 page is unaffected**

Nav to 週結算 and confirm the per-week breakdown still shows correct numbers (this should not have changed).

- [ ] **Step 10: Final commit if any docs need touching**

If everything passes, nothing more to commit. If the README or docs mentioned the old separate "記錄自摸" flow and that's now outdated, update accordingly:

```bash
grep -n "記錄自摸" README.md sheet-template/README.md
```

If matches refer to the old separate flow, edit them. Otherwise skip.

```bash
git status
```

Confirm clean tree.

---

## Self-Review Note

Plan checked against the spec:
- A.1 backend action → Task 1 ✓
- A.2 keep addTsumo backend → preserved (we never delete the handlers) ✓
- B.1 entry adjustments → Task 7 (Dashboard button), Task 8/9 (nav) ✓
- B.2 AddRound rewrite → Task 6 ✓
- B.3 store/api → Tasks 3, 4 ✓
- B.4 nav/routing → Tasks 8, 9 ✓
- C.1 buildSettledRanking → Task 5 ✓
- C.2 Dashboard ranking card → Task 7 ✓
- C.3 empty state → Task 7 (`settledWeekCount === 0` branch) ✓
- AddTsumo.tsx deletion → Task 10 ✓
- All 9 manual test cases → Task 11 ✓

No placeholders, no "similar to" references, every step shows actual code.
