import dayjs from 'dayjs';
import type {
  AppData,
  BoolLike,
  GlobalPlayer,
  Id,
  IsoDate,
  Ledger,
  NumLike,
  Player,
  Round,
  RoundEntry,
  Snapshot,
  Tsumo,
  Withdrawal
} from '../types';

// ===== 格式化 =====
export function fmtMoney(n: NumLike | null | undefined, symbol = '$'): string {
  const num = Number(n) || 0;
  return symbol + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtSignedMoney(n: NumLike | null | undefined, symbol = '$'): string {
  const num = Number(n) || 0;
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return sign + symbol + Math.abs(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// 以「本地日曆日」為單位比較（用 startOf('day')），避免跨零點時出現
// 「昨晚 23:50 紀錄，隔天早上仍顯示今天」的 24 小時換算誤差。
export function fmtRelativeDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const target = dayjs(value);
  if (!target.isValid()) return String(value);
  const diffDays = dayjs().startOf('day').diff(target.startOf('day'), 'day');
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 0) return fmtDate(value);
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`;
  return fmtDate(value);
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = dayjs(value);
  if (!d.isValid()) return String(value);
  return d.format('YYYY/MM/DD');
}

// 'YYYY-MM-DD' → 'M/D'
export function fmtMDFromISO(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return String(iso);
  return d.format('M/D');
}

export function todayISO(): string {
  return dayjs().format('YYYY-MM-DD');
}

// ===== 週工具 =====
// 結算日是週期的最後一天（0 = 週日，同 dayjs().day()），週期從結算日的隔天開始。
// 結算日 = 週日時就是週一到週日。

// 回傳某日所屬週期的第一天（YYYY-MM-DD）
export function weekStartISO(value: string | Date, settleWeekday: number): string {
  const d = dayjs(value);
  if (!d.isValid()) return '';
  const startDay = (settleWeekday + 1) % 7;
  const back = (d.day() - startDay + 7) % 7;
  return d.subtract(back, 'day').format('YYYY-MM-DD');
}

export function weekRangeLabel(weekStart: string): string {
  const start = dayjs(weekStart);
  if (!start.isValid()) return weekStart;
  const end = start.add(6, 'day');
  return `${start.format('M/D')}–${end.format('M/D')}`;
}

// ===== Round 驗證 =====
export interface RoundValidation {
  ok: boolean;
  diff: number;       // Σ amount（合法時應為 0）
  reason?: string;
}

export function validateRoundEntries(entries: RoundEntry[]): RoundValidation {
  if (entries.length !== 4) {
    return { ok: false, diff: 0, reason: '需要恰好 4 位玩家' };
  }
  const ids = new Set<Id>();
  for (const e of entries) {
    if (!e.player_id) return { ok: false, diff: 0, reason: '玩家未選齊' };
    if (ids.has(e.player_id)) return { ok: false, diff: 0, reason: '玩家不可重複' };
    ids.add(e.player_id);
  }
  const diff = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  if (diff !== 0) return { ok: false, diff, reason: '輸贏總和需為 0' };
  return { ok: true, diff: 0 };
}

// ===== 每局 cut（贏家 × cut_ratio）=====
export function roundCutFor(amount: number, cutRatio: number): number {
  if (amount <= 0) return 0;
  return Math.round(amount * cutRatio);
}

// ===== 計算：玩家貢獻 =====
export interface Contribution {
  tsumo: number;
  settle: number;
  total: number;
  tsumoCount: number;
}

export type ContributionMap = Record<Id, Contribution>;

const emptyContribution = (): Contribution => ({
  tsumo: 0,
  settle: 0,
  total: 0,
  tsumoCount: 0
});

export function calcContributions(
  players: Player[],
  tsumos: Tsumo[] | undefined,
  rounds: Round[] | undefined
): ContributionMap {
  const map: ContributionMap = {};
  for (const p of players) map[p.id] = emptyContribution();

  for (const t of tsumos ?? []) {
    const pid = t.player_id;
    const bucket = map[pid] ?? (map[pid] = emptyContribution());
    const amt = Number(t.amount) || 0;
    const cnt = Number(t.count) || 1;
    bucket.tsumo += amt;
    bucket.tsumoCount += cnt;
    bucket.total += amt;
  }

  for (const r of rounds ?? []) {
    const pid = r.player_id;
    const bucket = map[pid] ?? (map[pid] = emptyContribution());
    const cut = Number(r.cut_amount) || 0;
    bucket.settle += cut;
    bucket.total += cut;
  }

  return map;
}

// ===== 計算：餘額 =====
export interface BalanceResult {
  income: number;
  tsumoSum: number;
  settleSum: number;
  out: number;
  balance: number;
}

export function calcBalance(
  tsumos: Tsumo[] | undefined,
  rounds: Round[] | undefined,
  withdrawals: Withdrawal[] | undefined
): BalanceResult {
  const tsumoSum = (tsumos ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const settleSum = (rounds ?? []).reduce((s, r) => s + (Number(r.cut_amount) || 0), 0);
  const income = tsumoSum + settleSum;
  const out = (withdrawals ?? []).reduce((s, w) => s + (Number(w.amount) || 0), 0);
  return { income, tsumoSum, settleSum, out, balance: income - out };
}

// ===== 排行榜 =====
export interface LeaderboardEntry {
  id: Id;
  name: string;
  active: boolean;
  tsumo: number;
  settle: number;
  total: number;
  tsumoCount: number;
  pct: number;
}

export interface Leaderboard {
  list: LeaderboardEntry[];
  total: number;
}

export function buildLeaderboard(
  players: Player[],
  tsumos: Tsumo[] | undefined,
  rounds: Round[] | undefined
): Leaderboard {
  const contrib = calcContributions(players, tsumos, rounds);
  const total = Object.values(contrib).reduce((s, c) => s + c.total, 0);

  const list = players
    .map<LeaderboardEntry>((p) => {
      const c = contrib[p.id] ?? emptyContribution();
      return {
        id: p.id,
        name: p.name,
        active: asBool(p.active),
        tsumo: c.tsumo,
        settle: c.settle,
        total: c.total,
        tsumoCount: c.tsumoCount,
        pct: total > 0 ? (c.total / total) * 100 : 0
      };
    })
    .filter((p) => p.total > 0 || p.active)
    .sort((a, b) => b.total - a.total);

  return { list, total };
}

// ===== 人名對照 =====
export function playerName(players: Player[], id: Id): string {
  const p = players.find((x) => x.id === id);
  return p ? p.name : '(已刪除)';
}

// ===== Boolean 正規化 =====
export function asBool(v: BoolLike | null | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return !!v;
}

// ===== Round grouping (by round_id / by week) =====

export interface RoundGroup {
  round_id: Id;
  date: IsoDate;
  created_at?: IsoDate;
  note?: string;
  rows: Round[];
  cutTotal: number;
  settled: boolean;
  settled_at?: string;
}

export function groupByRoundId(rounds: Round[] | undefined): RoundGroup[] {
  const map = new Map<Id, RoundGroup>();
  for (const r of rounds ?? []) {
    const key = r.round_id || r.id;
    let g = map.get(key);
    if (!g) {
      g = {
        round_id: key,
        date: r.date,
        created_at: r.created_at,
        note: r.note,
        rows: [],
        cutTotal: 0,
        settled: asBool(r.settled),
        settled_at: r.settled_at
      };
      map.set(key, g);
    }
    g.rows.push(r);
    g.cutTotal += Number(r.cut_amount) || 0;
    if (!asBool(r.settled)) g.settled = false;
    if (r.note && !g.note) g.note = r.note;
  }
  return [...map.values()].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

export interface WeekBucket {
  weekStart: string;        // YYYY-MM-DD（週期第一天）
  rounds: RoundGroup[];
  cutTotal: number;
  perPlayer: Record<Id, number>; // 累計淨輸贏
  settled: boolean;         // 整週皆已結算才為 true
}

export function groupRoundsByWeek(
  rounds: Round[] | undefined,
  settleWeekday: number
): WeekBucket[] {
  const byId = groupByRoundId(rounds);
  const weeks = new Map<string, WeekBucket>();
  for (const g of byId) {
    const wk = weekStartISO(g.date, settleWeekday);
    if (!wk) continue;
    let bucket = weeks.get(wk);
    if (!bucket) {
      bucket = { weekStart: wk, rounds: [], cutTotal: 0, perPlayer: {}, settled: true };
      weeks.set(wk, bucket);
    }
    bucket.rounds.push(g);
    bucket.cutTotal += g.cutTotal;
    if (!g.settled) bucket.settled = false;
    for (const row of g.rows) {
      const pid = row.player_id;
      bucket.perPlayer[pid] = (bucket.perPlayer[pid] ?? 0) + (Number(row.amount) || 0);
    }
  }
  // 若週內無 rounds，settled 預設 true 但應在上面被覆蓋；保守處理：沒 rounds 的週不會出現
  return [...weeks.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

export function hasUnsettledPriorWeek(
  rounds: Round[] | undefined,
  settleWeekday: number,
  today: Date = new Date()
): boolean {
  const thisWeekStart = weekStartISO(today, settleWeekday);
  const weeks = groupRoundsByWeek(rounds, settleWeekday);
  return weeks.some((w) => w.weekStart < thisWeekStart && !w.settled);
}

// ===== 已結算排名榜 =====
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

export interface SettledRanking {
  list: SettledRankingEntry[];        // sorted by net desc
  cutoffISO: string | null;           // 最後一個已結算週期的最後一天（weekStart + 6）；沒有則為 null
  settledWeekCount: number;
}

export function buildSettledRanking(
  players: Player[],
  tsumos: Tsumo[] | undefined,
  rounds: Round[] | undefined,
  settleWeekday: number
): SettledRanking {
  const weeks = groupRoundsByWeek(rounds, settleWeekday);
  const settledWeeks = weeks.filter((w) => w.settled);
  const settledWeekStarts = new Set(settledWeeks.map((w) => w.weekStart));

  const winLossByPid: Record<Id, number> = {};
  const cutByPid: Record<Id, number> = {};
  const tsumoAmountByPid: Record<Id, number> = {};
  const tsumoCountByPid: Record<Id, number> = {};
  const roundCountByPid: Record<Id, number> = {};
  const winCountByPid: Record<Id, number> = {};

  for (const w of settledWeeks) {
    for (const g of w.rounds) {
      for (const row of g.rows) {
        const pid = row.player_id;
        winLossByPid[pid] = (winLossByPid[pid] ?? 0) + (Number(row.amount) || 0);
        cutByPid[pid] = (cutByPid[pid] ?? 0) + (Number(row.cut_amount) || 0);
        roundCountByPid[pid] = (roundCountByPid[pid] ?? 0) + 1;
        if ((Number(row.amount) || 0) > 0) {
          winCountByPid[pid] = (winCountByPid[pid] ?? 0) + 1;
        }
      }
    }
  }

  for (const t of tsumos ?? []) {
    const wk = weekStartISO(t.date, settleWeekday);
    if (!wk || !settledWeekStarts.has(wk)) continue;
    const pid = t.player_id;
    tsumoAmountByPid[pid] = (tsumoAmountByPid[pid] ?? 0) + (Number(t.amount) || 0);
    tsumoCountByPid[pid] = (tsumoCountByPid[pid] ?? 0) + (Number(t.count) || 0);
  }

  const list = players
    .map<SettledRankingEntry>((p) => {
      const winLoss = winLossByPid[p.id] ?? 0;
      const cut = cutByPid[p.id] ?? 0;
      const tsumoAmount = tsumoAmountByPid[p.id] ?? 0;
      const tsumoCount = tsumoCountByPid[p.id] ?? 0;
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
        avgPerRound: roundCount > 0 ? winLoss / roundCount : null
      };
    })
    .filter((e) => e.winLoss !== 0 || e.cut !== 0 || e.tsumoAmount !== 0)
    .sort((a, b) => b.net - a.net);

  let cutoffISO: string | null = null;
  if (settledWeeks.length > 0) {
    const sorted = settledWeeks
      .map((w) => w.weekStart)
      .sort();          // ascending lexicographic on 'YYYY-MM-DD' == chronological
    const latest = sorted[sorted.length - 1];
    cutoffISO = dayjs(latest).add(6, 'day').format('YYYY-MM-DD');
  }

  return { list, cutoffISO, settledWeekCount: settledWeeks.length };
}

// ===== 帳本 =====
// 後端 backend/Code.gs 有同一份 WEEKDAY_ZH，兩邊要一起改
export const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function settleDayLabel(settleWeekday: number): string {
  return WEEKDAY_ZH[settleWeekday] ?? '日';
}

export interface PurposeLabels {
  expense: string;
  recordExpense: string;
  spent: string;
  goalNameField: string;
  goalFallback: string;
}

// purpose 為空時直接接成「支出」「目標」等通用說法
export function purposeLabels(purpose: string): PurposeLabels {
  return {
    expense: `${purpose}支出`,
    recordExpense: `記錄${purpose}支出`,
    spent: `已${purpose}支出`,
    goalNameField: `${purpose}目標名稱`,
    goalFallback: `${purpose}目標`
  };
}

// 記住的帳本已不存在時退回第一本（後端依代號排序，即 L1）
export function resolveLedgerId(ledgers: Ledger[], stored: string | null): Id | null {
  if (stored && ledgers.some((l) => l.id === stored)) return stored;
  return ledgers[0]?.id ?? null;
}

export function buildLedgerView(snapshot: Snapshot, ledgerId: Id | null): AppData | null {
  const ledger = snapshot.ledgers.find((l) => l.id === ledgerId);
  if (!ledger) return null;
  const byId = new Map(snapshot.players.map((p) => [String(p.id), p]));
  const players: Player[] = [];
  for (const m of ledger.members) {
    const p = byId.get(String(m.player_id));
    if (!p) continue;
    players.push({ id: p.id, name: p.name, active: m.active, created_at: p.created_at });
  }
  return {
    players,
    tsumos: ledger.tsumos,
    rounds: ledger.rounds,
    withdrawals: ledger.withdrawals,
    settings: {
      name: ledger.name,
      purpose: ledger.purpose,
      goal: ledger.goal,
      goal_name: ledger.goal_name,
      tsumo_amount: ledger.tsumo_amount,
      cut_ratio: ledger.cut_ratio,
      settle_weekday: ledger.settle_weekday,
      currency_symbol: snapshot.settings.currency_symbol || '$'
    }
  };
}

// 拉入候選：還不是這本帳成員的全域玩家，包含在其他帳本停用的人
export function pullCandidates(allPlayers: GlobalPlayer[], members: Player[]): GlobalPlayer[] {
  const memberIds = new Set(members.map((p) => p.id));
  return allPlayers.filter((p) => !memberIds.has(p.id));
}

// 玩家名稱與帳本名稱都要唯一；後端 findNameConflict 會再檢查一次
export function isNameTaken(
  rows: ReadonlyArray<{ id: Id; name: string }>,
  name: string,
  exceptId?: Id
): boolean {
  const target = name.trim();
  return rows.some((r) => r.id !== exceptId && String(r.name).trim() === target);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
