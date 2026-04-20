import { useMemo, useState } from "react";
import { useStore } from "../hooks/useStore";
import {
  fmtDate,
  fmtMoney,
  fmtSignedMoney,
  groupRoundsByWeek,
  playerName,
  weekRangeLabel,
  weekStartISO,
} from "../lib/utils";
import type { Id } from "../types";
import Card from "./ui/Card";
import Button from "./ui/Button";
import ConfirmDialog from "./ui/ConfirmDialog";

interface PlayerWeekDetail {
  cut: number;
  tsumo: number;
}

export default function WeeklySettlements() {
  const { data, isAdmin, actions } = useStore();
  const { players, rounds, tsumos, settings } = data;
  const symbol = settings.currency_symbol || "$";

  const weeks = useMemo(() => groupRoundsByWeek(rounds), [rounds]);
  const thisMonday = weekStartISO(new Date());

  // 每週 × 每玩家的 cut（抽成）與 tsumo（當週自摸金額）聚合
  // 用於計算「實拿 = amount − cut − tsumo」
  const perWeekPlayerDetail = useMemo(() => {
    const result: Record<string, Record<Id, PlayerWeekDetail>> = {};
    const ensure = (wk: string, pid: Id): PlayerWeekDetail => {
      const byPid = result[wk] ?? (result[wk] = {});
      return byPid[pid] ?? (byPid[pid] = { cut: 0, tsumo: 0 });
    };
    for (const w of weeks) {
      for (const g of w.rounds) {
        for (const row of g.rows) {
          ensure(w.weekStart, row.player_id).cut += Number(row.cut_amount) || 0;
        }
      }
    }
    for (const t of tsumos ?? []) {
      const wk = weekStartISO(t.date);
      if (!wk || !result[wk]) continue; // 只納入已有 rounds 的週
      ensure(wk, t.player_id).tsumo += Number(t.amount) || 0;
    }
    return result;
  }, [weeks, tsumos]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{
    weekStart: string;
    settled: boolean;
    label: string;
  } | null>(null);

  const toggleExpand = (wk: string) =>
    setExpanded((prev) => ({ ...prev, [wk]: !prev[wk] }));

  const applyMark = async () => {
    if (!confirm) return;
    try {
      await actions.markWeekSettled(confirm.weekStart, confirm.settled);
    } catch {
      // toast 已由 store 顯示
    }
    setConfirm(null);
  };

  if (weeks.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-ink-3">
          <div className="text-5xl mb-3">💰</div>
          <div className="text-[18px]">還沒有每局結算記錄</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-honey/10 border-2 border-honey/40">
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <div className="text-[16px] font-bold text-honey">
              僅管理員可標記「已結算」
            </div>
          </div>
        </div>
      )}
      {weeks.map((w) => {
        const isCurrentWeek = w.weekStart === thisMonday;
        const isOpen = !!expanded[w.weekStart];
        const detail = perWeekPlayerDetail[w.weekStart] ?? {};
        const perPlayerList = Object.entries(w.perPlayer)
          .map(([pid, amt]) => {
            const d = detail[pid as Id] ?? { cut: 0, tsumo: 0 };
            return {
              pid: pid as Id,
              amt,
              cut: d.cut,
              tsumo: d.tsumo,
              net: amt - d.cut - d.tsumo,
            };
          })
          .sort((a, b) => b.amt - a.amt);
        const top = perPlayerList[0];
        const topWinnerPid = top && top.amt > 0 ? top.pid : null;
        const weekTsumoTotal = Object.values(detail).reduce(
          (s, d) => s + d.tsumo,
          0,
        );
        const weekFundTotal = w.cutTotal + weekTsumoTotal;
        const weekTsumos = (tsumos ?? [])
          .filter((t) => weekStartISO(t.date) === w.weekStart)
          .slice()
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        return (
          <Card key={w.weekStart} padding="p-0">
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-serif text-[20px] font-bold">
                      {weekRangeLabel(w.weekStart)}
                    </span>
                    {isCurrentWeek && (
                      <span className="text-[13px] px-2 py-0.5 rounded-full bg-sage/10 text-sage-deep font-medium">
                        本週
                      </span>
                    )}
                    {w.settled ? (
                      <span className="text-[13px] px-2 py-0.5 rounded-full bg-sage-deep text-white font-medium">
                        已結算
                      </span>
                    ) : (
                      <span className="text-[13px] px-2 py-0.5 rounded-full bg-honey/20 text-honey font-medium">
                        未結算
                      </span>
                    )}
                  </div>
                  <div className="text-[15px] text-ink-3 mt-1">
                    {w.rounds.length} 局 · 入公基金{" "}
                    <span className="num text-honey font-medium">
                      {fmtMoney(weekFundTotal, symbol)}
                    </span>
                  </div>
                  {weekFundTotal > 0 && (
                    <div className="text-[13px] text-ink-3">
                      抽成{" "}
                      <span className="num">
                        {fmtMoney(w.cutTotal, symbol)}
                      </span>
                      {weekTsumoTotal > 0 && (
                        <>
                          {" "}
                          + 自摸{" "}
                          <span className="num">
                            {fmtMoney(weekTsumoTotal, symbol)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-3">
                {perPlayerList.map(({ pid, amt, cut, tsumo, net }) => {
                  const showBreakdown = amt > 0;
                  return (
                    <div key={pid}>
                      <div className="flex items-center justify-between text-[16px]">
                        <span className="truncate flex items-center gap-1">
                          {pid === topWinnerPid && (
                            <span aria-label="本週贏家">👑</span>
                          )}
                          {playerName(players, pid)}
                        </span>
                        <span
                          className={`num ${
                            amt > 0
                              ? "text-sage-deep"
                              : amt < 0
                                ? "text-red-700"
                                : "text-ink-3"
                          }`}
                        >
                          {fmtSignedMoney(amt, symbol)}
                        </span>
                      </div>
                      {showBreakdown && (
                        <div className="text-[13px] text-ink-3 pl-5 mt-0.5">
                          實拿{" "}
                          <span className="num text-sage-deep font-medium">
                            {fmtSignedMoney(net, symbol)}
                          </span>{" "}
                          = <span className="num">{fmtMoney(amt, symbol)}</span>
                          {cut > 0 && (
                            <>
                              {" "}
                              − 抽成{" "}
                              <span className="num">{fmtMoney(cut, symbol)}</span>
                            </>
                          )}
                          {tsumo > 0 && (
                            <>
                              {" "}
                              − 自摸{" "}
                              <span className="num">
                                {fmtMoney(tsumo, symbol)}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExpand(w.weekStart)}
                >
                  {isOpen ? "收合" : "展開逐局"}
                </Button>
                {isAdmin && (
                  <Button
                    variant={w.settled ? "secondary" : "primary"}
                    size="sm"
                    onClick={() =>
                      setConfirm({
                        weekStart: w.weekStart,
                        settled: !w.settled,
                        label: weekRangeLabel(w.weekStart),
                      })
                    }
                  >
                    {w.settled ? "取消結算" : "標記已結算"}
                  </Button>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-divider divide-y divide-divider">
                {w.rounds.map((g) => (
                  <div key={g.round_id} className="p-4">
                    <div className="text-[14px] text-ink-3 mb-2">
                      {fmtDate(g.date)}
                      {g.note ? ` · ${g.note}` : ""}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {g.rows.map((row) => {
                        const amt = Number(row.amount) || 0;
                        const cut = Number(row.cut_amount) || 0;
                        const net = amt - cut;
                        return (
                          <div key={row.id} className="text-[15px]">
                            <div className="flex items-center justify-between">
                              <span className="truncate">
                                {playerName(players, row.player_id)}
                              </span>
                              <span
                                className={`num ${
                                  amt > 0
                                    ? "text-sage-deep"
                                    : amt < 0
                                      ? "text-red-700"
                                      : "text-ink-3"
                                }`}
                              >
                                {fmtSignedMoney(amt, symbol)}
                              </span>
                            </div>
                            {amt > 0 && cut > 0 && (
                              <div className="text-[12px] text-ink-3 text-right mt-0.5">
                                實拿{" "}
                                <span className="num">
                                  {fmtSignedMoney(net, symbol)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {g.cutTotal > 0 && (
                      <div className="text-[13px] text-honey mt-2">
                        抽成入公基金 {fmtMoney(g.cutTotal, symbol)}
                      </div>
                    )}
                  </div>
                ))}
                {weekTsumos.length > 0 && (
                  <div className="p-4 bg-honey/5">
                    <div className="text-[13px] text-ink-3 mb-2">
                      本週自摸 · 共{" "}
                      <span className="num text-honey font-medium">
                        {fmtMoney(weekTsumoTotal, symbol)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {weekTsumos.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between text-[15px]"
                        >
                          <span className="truncate">
                            {fmtDate(t.date)} ·{" "}
                            {playerName(players, t.player_id)} ×{" "}
                            {String(t.count)}
                          </span>
                          <span className="num text-honey">
                            +{fmtMoney(t.amount, symbol)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.settled ? "標記已結算？" : "取消結算？"}
        message={
          confirm
            ? confirm.settled
              ? `將「${confirm.label}」該週所有局標記為已結算。`
              : `將「${confirm.label}」該週改回未結算。`
            : ""
        }
        confirmText={confirm?.settled ? "標記已結算" : "取消結算"}
        variant={confirm?.settled ? "primary" : "secondary"}
        onConfirm={applyMark}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
