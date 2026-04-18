// ===== 格式化 =====
export function fmtMoney(n, symbol = '$') {
  const num = Number(n) || 0;
  return symbol + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function fmtRelativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return diffDays + ' 天前';
  if (diffDays < 30) return Math.floor(diffDays / 7) + ' 週前';
  return fmtDate(iso);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ===== 計算：玩家貢獻 =====
// 回傳 { playerId: { tsumo: N, settle: N, total: N, tsumoCount: N } }
export function calcContributions(players, tsumos, settlements) {
  const map = {};
  players.forEach(p => {
    map[p.id] = { tsumo: 0, settle: 0, total: 0, tsumoCount: 0 };
  });

  (tsumos || []).forEach(t => {
    const pid = t.player_id;
    if (!map[pid]) map[pid] = { tsumo: 0, settle: 0, total: 0, tsumoCount: 0 };
    const amt = Number(t.amount) || 0;
    const cnt = Number(t.count) || 1;
    map[pid].tsumo += amt;
    map[pid].tsumoCount += cnt;
    map[pid].total += amt;
  });

  (settlements || []).forEach(s => {
    const pid = s.player_id;
    if (!map[pid]) map[pid] = { tsumo: 0, settle: 0, total: 0, tsumoCount: 0 };
    const cut = Number(s.cut_amount) || 0;
    map[pid].settle += cut;
    map[pid].total += cut;
  });

  return map;
}

// ===== 計算：餘額 =====
export function calcBalance(tsumos, settlements, withdrawals) {
  const tsumoSum = (tsumos || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const settleSum = (settlements || []).reduce((s, x) => s + (Number(x.cut_amount) || 0), 0);
  const income = tsumoSum + settleSum;
  const out = (withdrawals || []).reduce((s, w) => s + (Number(w.amount) || 0), 0);
  return { income, tsumoSum, settleSum, out, balance: income - out };
}

// ===== 排行榜 =====
export function buildLeaderboard(players, tsumos, settlements) {
  const contrib = calcContributions(players, tsumos, settlements);
  const total = Object.values(contrib).reduce((s, c) => s + c.total, 0);

  const list = players
    .map(p => {
      const c = contrib[p.id] || { tsumo: 0, settle: 0, total: 0, tsumoCount: 0 };
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
    .filter(p => p.total > 0 || p.active)
    .sort((a, b) => b.total - a.total);

  return { list, total };
}

// ===== 人名對照 =====
export function playerName(players, id) {
  const p = players.find(p => p.id === id);
  return p ? p.name : '(已刪除)';
}

// ===== 最常自摸的玩家（下次優先顯示）=====
export function recentTsumoPlayers(tsumos, limit = 3) {
  const sorted = [...(tsumos || [])].sort((a, b) => {
    const ta = new Date(a.created_at || a.date).getTime();
    const tb = new Date(b.created_at || b.date).getTime();
    return tb - ta;
  });
  const seen = new Set();
  const result = [];
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
export function asBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return !!v;
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
