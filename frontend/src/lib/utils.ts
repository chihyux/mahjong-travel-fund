import dayjs from 'dayjs';
import type {
  BoolLike,
  Id,
  IsoDate,
  NumLike,
  Player,
  Round,
  RoundEntry,
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

export function todayISO(): string {
  return dayjs().format('YYYY-MM-DD');
}

// ===== 週 (Monday-Sunday) 工具 =====

// 回傳某日所屬週的週一日期（YYYY-MM-DD）
export function weekStartISO(value: string | Date): string {
  const d = dayjs(value);
  if (!d.isValid()) return '';
  const day = d.day(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return d.add(diff, 'day').format('YYYY-MM-DD');
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

// ===== 最常自摸的玩家（下次優先顯示）=====
export function recentTsumoPlayers(tsumos: Tsumo[] | undefined, limit = 3): Id[] {
  const sorted = [...(tsumos ?? [])].sort((a, b) => {
    const ta = new Date(a.created_at || a.date).getTime();
    const tb = new Date(b.created_at || b.date).getTime();
    return tb - ta;
  });
  const seen = new Set<Id>();
  const result: Id[] = [];
  for (const t of sorted) {
    if (!seen.has(t.player_id)) {
      seen.add(t.player_id);
      result.push(t.player_id);
      if (result.length >= limit) break;
    }
  }
  return result;
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
  return [...map.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export interface WeekBucket {
  weekStart: string;        // YYYY-MM-DD (Monday)
  rounds: RoundGroup[];
  cutTotal: number;
  perPlayer: Record<Id, number>; // 累計淨輸贏
  settled: boolean;         // 整週皆已結算才為 true
}

export function groupRoundsByWeek(rounds: Round[] | undefined): WeekBucket[] {
  const byId = groupByRoundId(rounds);
  const weeks = new Map<string, WeekBucket>();
  for (const g of byId) {
    const wk = weekStartISO(g.date);
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
  today: Date = new Date()
): boolean {
  const thisMonday = weekStartISO(today);
  const weeks = groupRoundsByWeek(rounds);
  return weeks.some((w) => w.weekStart < thisMonday && !w.settled);
}

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

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
