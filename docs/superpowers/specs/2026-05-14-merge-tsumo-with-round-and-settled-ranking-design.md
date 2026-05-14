# 合併「記錄自摸」與「每局結算」+ 已結算排名榜

日期：2026-05-14
範圍：前端 + 後端（schema 不動）

## 目標

1. 將「記錄自摸」與「每局結算」合併成單一「記錄一局」表單，一次寫入 1 局 + 0..4 筆自摸。自摸玩家鎖定為該局 4 人之內。
2. 移除 Dashboard 上的「輸家榜」，改為「已結算排名榜」：以週結算的計算方式（amount − 抽成 − 自摸 = net）排序，顯示輸/贏/自摸明細與「截至日期（已結算）」。

## 非目標

- 不變動 Google Sheet schema（`Players` / `Tsumos` / `Rounds` / `Withdrawals` / `Settings` 欄位皆不動）。
- 不調整「週結算」頁面的計算或顯示。
- 不調整「歷史」分頁的兩個 tab（自摸 tab 仍顯示既有自摸資料）。
- 不支援「編輯一局時連同自摸一起編輯」（v1 暫不做；維持目前 round 編輯與 tsumo 編輯分離的能力）。

## A. 後端

### A.1 新增 action：`addRoundWithTsumos`

`backend/Code.gs`：

- 加入 `'addRoundWithTsumos'` 至 `writeActions` 白名單。
- `switch` 加 `case 'addRoundWithTsumos': return handleAddRoundWithTsumos(body);`
- 新增 handler `handleAddRoundWithTsumos(body)`：
  - 驗 `body.date` 不為空。
  - 驗 `body.entries`：複用現有 4 人 / sum=0 / 不重複 / 非全 0 規則（沿用 `handleAddRound` 的驗證邏輯）。
  - 驗 `body.tsumos`（選填，預設 `[]`）：
    - 是陣列、每筆 `{ player_id, count }`。
    - `count` 為正整數（≥ 1）；count=0 或缺漏的玩家請前端過濾、不要送上來。
    - 每筆 `player_id` 必須在 `entries` 的 4 人之內。
    - `player_id` 不可重複（同玩家不可在 tsumos 出現兩次）。
  - 寫入順序：先 4 列 Rounds（沿用 `handleAddRound` 計算 cut），再 N 列 Tsumos（`amount = count × currentTsumoAmount()`，date 沿用 round 的 date，note 留空字串）。
  - 回傳 `{ round_id, tsumo_ids: [...] }`。
- 沿用 Apps Script 單管理員、無 transaction 的現實：若 N 列 Tsumos 寫到一半失敗，rounds 已存在；接受這個風險（同既有 `handleAddRound` 4 列 append 中途失敗的風險量級）。

### A.2 保留 `addTsumo` action

`addTsumo` / `updateTsumo` / `deleteTsumo` 保留在後端，避免破壞「歷史 → 自摸」刪除等既有功能（歷史 tsumo 仍可單筆刪）。

## B. 前端：合併表單

### B.1 入口調整

`frontend/src/components/Dashboard.tsx`：
- 移除「🀄 記錄自摸」按鈕。
- 「💰 每局結算」按鈕標籤改為「💰 記錄一局」，仍 nav 到 `'addRound'`。
- 其他按鈕（週結算、旅遊支出）不動。

`frontend/src/App.tsx` / 路由：移除 `'addTsumo'` ViewKey 與對應 render。`types.ts` 的 `ViewKey` 移除 `'addTsumo'`。

`frontend/src/components/AddTsumo.tsx`：整檔刪除。

### B.2 改寫 `AddRound.tsx`

標題改為「記錄一局」。表單由上至下：

1. **日期**（同現有）
2. **四位玩家輸贏**（同現有 4 個 slot；維持 +/− 切換與金額輸入、PlayerPickerModal）
3. **自摸（選填）區塊** — 新增
4. **備註**（同現有）
5. **結算明細**（修改：加入自摸入公的條目）
6. **取消 / 儲存**（儲存改呼叫新 action）

#### 自摸區塊行為

- 元件位置：`AddRound.tsx` 內部，置於四位玩家輸贏與備註之間。
- 標題：「自摸（選填）」，副標：「該局誰自摸了幾次？沒人自摸就保持 0」。
- **鎖定條件**：4 個 slot 任一玩家未選 → 區塊整塊 `aria-disabled`、灰底、stepper disabled、提示「請先選齊 4 位玩家」。
- **解鎖後**：顯示 4 列 row，每列 = 該玩家名（依 slot 順序 1→4）+ stepper（0..9，預設 0）+ 即時金額預覽 `tsumo_amount × count`。
- 使用既有 `ui/Stepper` 元件（已預設 `min=0`，無需改動）。每人 count 範圍 `0..9`（傳 `max={9}`）。
- State：`const [tsumoCounts, setTsumoCounts] = useState<Record<Id, number>>({})` 以 `player_id` 為 key。
- 玩家變更時：若某 slot 改為不同 player_id，舊 player_id 的 count 由 map 移除（避免殘留）。

#### 結算明細修改

新增「自摸入公」一行，置於現有「抽成」之上或之下：
- `tsumoCutTotal = Σ count × tsumo_amount`（即所有自摸金額；100% 入公）
- `cutTotal` = 既有抽成
- 「入公基金合計」改為 `cutTotal + tsumoCutTotal`

#### 提交

`submit()` 呼叫新 action：

```ts
await actions.addRoundWithTsumos({
  date,
  entries: slots.map(s => ({ player_id: s.player_id, amount: signedAmount(s) })),
  tsumos: slotPlayerIds
    .map(pid => ({ player_id: pid, count: tsumoCounts[pid] ?? 0 }))
    .filter(t => t.count > 0),
  note
});
```

### B.3 Store / API client

`frontend/src/lib/api.ts`：
- 新增 `addRoundWithTsumos(pw, payload)` 對應 backend action。
- 保留 `addTsumo`（仍用於歷史刪除流程？實際上 useStore 仍會 expose `deleteTsumo`；`addTsumo` 變成 unused 可移除）。
  - 決策：保留 `addTsumo` API client，但從 store 的 `actions.addTsumo` 移除（無 caller）。或者連同 store 一起移除。**v1：一併移除 `actions.addTsumo` 與 `api.addTsumo`**（後端 action 留著，未來要再加單筆自摸入口時恢復即可）。

`frontend/src/hooks/useStore.tsx`：
- `StoreActions` 移除 `addTsumo`、新增 `addRoundWithTsumos`。
- `actions.addRoundWithTsumos = wrap(...)`，toast「已記錄本局」。

`frontend/src/types.ts`：
- 新增 `RoundWithTsumosPayload`：
  ```ts
  export interface RoundTsumoEntry { player_id: Id; count: number; }
  export interface RoundWithTsumosPayload {
    date: IsoDate;
    entries: RoundEntry[];
    tsumos: RoundTsumoEntry[];
    note?: string;
  }
  ```
- 移除 `'addTsumo'` from `ViewKey`。
- `TsumoPayload` 保留（雖無人用，但 update/delete 的 payload 仍需要 `TsumoUpdatePayload`）。

### B.4 導覽與路由

`frontend/src/components/Shell.tsx`：
- **桌面側欄**：移除「記錄自摸」`NavItem`；保留「每局結算」NavItem，但 label 改為「記錄一局」。
- **手機底部 tab bar**：`ADMIN_NAV` 第 2 格 `{ key: 'addTsumo', icon: '🀄', label: '自摸' }` 改為 `{ key: 'addRound', icon: '🀄', label: '記錄一局' }`（沿用 🀄 emoji 以維持視覺記憶，因為自摸動作仍包含在內）。

`frontend/src/App.tsx`：
- `imports`：移除 `import AddTsumo from "./components/AddTsumo";`。
- `ADMIN_ONLY_VIEWS`：移除 `'addTsumo'`。
- `renderView()`：移除 `case 'addTsumo'`。
- `MoreMenu` items：將 `{ key: 'addRound', icon: '💰', label: '每局結算' }` 改為 `{ key: 'addRound', icon: '🀄', label: '記錄一局' }`（也順便對齊 tab bar emoji）。

## C. 已結算排名榜

### C.1 工具函式（`frontend/src/lib/utils.ts`）

**新增** `buildSettledRanking`：

```ts
export interface SettledRankingEntry {
  id: Id;
  name: string;
  winLoss: number;     // Σ amount in settled weeks (有正有負)
  cut: number;         // Σ cut_amount in settled weeks
  tsumoAmount: number; // Σ tsumos.amount whose date falls in a settled week
  tsumoCount: number;  // Σ tsumos.count 同上
  net: number;         // winLoss - cut - tsumoAmount
}

export interface SettledRanking {
  list: SettledRankingEntry[];       // 已 sort by net desc
  cutoffISO: string | null;          // 最新已結算週的週日 (weekStart + 6 天)；無已結算週時 null
  settledWeekCount: number;          // 已結算週數
}

export function buildSettledRanking(
  players: Player[],
  tsumos: Tsumo[] | undefined,
  rounds: Round[] | undefined
): SettledRanking
```

實作：
1. `groupRoundsByWeek(rounds)` → 取 `w.settled === true` 的週集合 `settledWeeks`。
2. `settledWeekStarts = new Set(settledWeeks.map(w => w.weekStart))`。
3. 對每個 settled week 的 `rounds` 累加每位玩家的 `winLoss` 與 `cut`。
4. 對 `tsumos` 篩出 `settledWeekStarts.has(weekStartISO(t.date))` 的，累加 `tsumoAmount` 與 `tsumoCount`。
5. 對每位 player 組出 entry，過濾掉 `winLoss === 0 && cut === 0 && tsumoAmount === 0` 的人（從未參與已結算週）。
6. 依 `net` 降序排序。
7. `cutoffISO` = settled week 中最新的 `weekStart + 6 天`（用既有 `addDaysStr` 的前端對應，或 dayjs `add(6,'day')`）。

**移除** `buildLoserboard` 與 `LoserboardEntry`。

### C.2 Dashboard 顯示

`frontend/src/components/Dashboard.tsx`：

- 刪除 `buildLoserboard` import 與「輸家榜」整塊 Card（行 226–262）。
- 在原位置插入「已結算排名」Card：

```tsx
const ranking = buildSettledRanking(players, tsumos, rounds);

{ranking.list.length > 0 && (
  <Card>
    <div className="flex items-center gap-3 mb-2">
      <div className="flex-1 h-px bg-divider" />
      <span className="font-serif text-[22px] font-bold">已結算排名</span>
      <div className="flex-1 h-px bg-divider" />
    </div>
    <div className="text-[14px] text-ink-3 text-center mb-5">
      截至 {fmtMD(ranking.cutoffISO!)}（已結算）
    </div>
    <div className="space-y-4">
      {ranking.list.map((p, i) => (
        <RankRow key={p.id} rank={i+1} entry={p} symbol={symbol} />
      ))}
    </div>
  </Card>
)}
```

- `RankRow` 顯示：
  - 左：`RankBadge`（沿用既有；變體用預設 winner 樣式）。
  - 中：名字 + 副標。副標格式：
    - `winLoss > 0`：「贏 $X · 抽成 $Y」+（`tsumoCount > 0` 時）「· 自摸 N 次 $Z」+（`tsumoCount === 0` 時）「· 自摸 0」
    - `winLoss < 0`：「輸 $|X|」+ 自摸同上
    - `winLoss === 0`：「持平」+ 自摸同上
  - 右：`net` 的有符號金額，正用 sage-deep（綠）、負用 red-700、0 用 ink-3。
- `fmtMD(iso)` = 小工具 or 直接 `dayjs(iso).format('M/D')`；已結算週日 = `dayjs(weekStart).add(6,'day').format('M/D')`。

### C.3 空狀態

當 `settledWeekCount === 0`：

```tsx
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
```

當有已結算週但 `ranking.list.length === 0`（極端情境，所有人都過濾掉）：同空狀態文字。

## D. 變更檔案清單

```
backend/Code.gs                                # +handleAddRoundWithTsumos, +action 路由
frontend/src/types.ts                          # +RoundWithTsumosPayload, -'addTsumo' ViewKey
frontend/src/lib/api.ts                        # +addRoundWithTsumos, -addTsumo
frontend/src/hooks/useStore.tsx                # +addRoundWithTsumos, -addTsumo
frontend/src/lib/utils.ts                      # +buildSettledRanking, -buildLoserboard
frontend/src/components/AddRound.tsx           # +自摸區塊, +tsumoCounts state, +submit 用新 action, 標題改
frontend/src/components/AddTsumo.tsx           # 整檔刪除
frontend/src/components/Dashboard.tsx          # -記錄自摸按鈕, 按鈕改名, -輸家榜, +已結算排名
frontend/src/components/Shell.tsx              # 桌面側欄移除「記錄自摸」NavItem、「每局結算」改名；手機 tab bar 第 2 格改為 addRound
frontend/src/App.tsx                           # 移除 AddTsumo import / case / ADMIN_ONLY_VIEWS 中的 addTsumo / MoreMenu addRound 標籤改名
```

## E. 測試重點（手動）

1. 4 人未選齊時自摸區是 disabled。
2. 選齊 4 人後解鎖；改其中一格的玩家，舊 player_id 的 count 不殘留。
3. 全為 0 的自摸 → 提交只寫 Rounds，沒寫 Tsumos。
4. 部分自摸（如 2 人各 1 次）→ 寫 Rounds + 2 列 Tsumos。
5. 結算明細「入公基金合計」= 抽成 + 自摸金額之和。
6. 提交後 Dashboard 餘額正確增加。
7. 標記某週為「已結算」後，已結算排名出現該週玩家；net 正確等於 amount − cut − tsumoAmount；排序為 net 降序；「截至」顯示該週週日。
8. 取消結算後該週資料退出排名；無已結算週時顯示空狀態。
9. 歷史 → 自摸 tab 仍能看到自摸記錄並能刪除。
