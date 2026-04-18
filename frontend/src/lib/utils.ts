import type {
  BoolLike,
  Id,
  NumLike,
  Player,
  Settlement,
  Tsumo,
  Withdrawal
} from '../types';

// ===== 格式化 =====
export function fmtMoney(n: NumLike | null | undefined, symbol = '$'): string {
  const num = Number(n) || 0;
  return symbol + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return diffDays + ' 天前';
  if (diffDays < 30) return Math.floor(diffDays / 7) + ' 週前';
  return fmtDate(iso);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  settlements: Settlement[] | undefined
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

  for (const s of settlements ?? []) {
    const pid = s.player_id;
    const bucket = map[pid] ?? (map[pid] = emptyContribution());
    const cut = Number(s.cut_amount) || 0;
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
  settlements: Settlement[] | undefined,
  withdrawals: Withdrawal[] | undefined
): BalanceResult {
  const tsumoSum = (tsumos ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const settleSum = (settlements ?? []).reduce((s, x) => s + (Number(x.cut_amount) || 0), 0);
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
  settlements: Settlement[] | undefined
): Leaderboard {
  const contrib = calcContributions(players, tsumos, settlements);
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

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
