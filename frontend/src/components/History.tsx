import { useMemo, useState } from "react";
import { useStore } from "../hooks/useStore";
import {
  fmtDate,
  fmtMoney,
  fmtSignedMoney,
  groupByRoundId,
  playerName,
} from "../lib/utils";
import type { Id } from "../types";
import Card from "./ui/Card";
import Segmented from "./ui/Segmented";
import ConfirmDialog from "./ui/ConfirmDialog";

type HistoryTab = "tsumos" | "rounds";

interface PendingDelete {
  type: "tsumo" | "round";
  id: Id; // tsumo.id 或 round_id
  label: string;
}

export default function History() {
  const { data, isAdmin, actions } = useStore();
  const { players, tsumos, rounds, settings } = data;
  const symbol = settings.currency_symbol || "$";

  const [tab, setTab] = useState<HistoryTab>("tsumos");
  const [confirmDel, setConfirmDel] = useState<PendingDelete | null>(null);

  const tsumoList = useMemo(
    () =>
      [...(tsumos ?? [])].sort(
        (a, b) =>
          new Date(b.created_at || b.date).getTime() -
          new Date(a.created_at || a.date).getTime(),
      ),
    [tsumos],
  );

  const roundGroups = useMemo(() => groupByRoundId(rounds), [rounds]);

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      if (confirmDel.type === "tsumo") await actions.deleteTsumo(confirmDel.id);
      else await actions.deleteRound(confirmDel.id);
    } catch {
      // toast 由 store 顯示
    }
    setConfirmDel(null);
  };

  return (
    <div className="space-y-4">
      <Segmented<HistoryTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "tsumos", label: `🀄 自摸 (${tsumoList.length})` },
          { value: "rounds", label: `💰 局 (${roundGroups.length})` },
        ]}
      />
      <Card>
        {tab === "tsumos" ? (
          tsumoList.length === 0 ? (
            <Empty icon="🀄" text="還沒有自摸記錄" />
          ) : (
            <div className="divide-y divide-divider">
              {tsumoList.map((t) => (
                <div key={t.id} className="py-2 flex items-center gap-3">
                  <div className="text-2xl">🀄</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[18px] font-medium">
                      {playerName(players, t.player_id)}
                      {Number(t.count) > 1 && (
                        <span className="text-ink-3 ml-1">
                          × {String(t.count)}
                        </span>
                      )}
                    </div>
                    <div className="text-[15px] text-ink-3">
                      {fmtDate(t.date)}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div className="num text-[20px] text-sage-deep">
                    +{fmtMoney(t.amount, symbol)}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() =>
                        setConfirmDel({
                          type: "tsumo",
                          id: t.id,
                          label: `${playerName(players, t.player_id)} 的自摸`,
                        })
                      }
                      className="w-11 h-11 rounded-full hover:bg-hint flex items-center justify-center text-ink-3 text-xl"
                      aria-label="刪除"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : roundGroups.length === 0 ? (
          <Empty icon="💰" text="還沒有局結算記錄" />
        ) : (
          <div className="divide-y divide-divider">
            {roundGroups.map((g) => (
              <div key={g.round_id} className="py-4">
                <div className="flex items-start gap-3 mb-2 items-center">
                  <div className="text-2xl">💰</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[17px] font-medium">
                        {fmtDate(g.date)}
                      </span>
                      {g.settled ? (
                        <span className="text-[12px] px-2 py-0.5 rounded-full bg-sage-deep text-white">
                          已結算
                        </span>
                      ) : (
                        <span className="text-[12px] px-2 py-0.5 rounded-full bg-honey/20 text-honey">
                          未結算
                        </span>
                      )}
                    </div>
                    {g.note && (
                      <div className="text-[14px] text-ink-3">{g.note}</div>
                    )}
                  </div>
                  {g.cutTotal > 0 && (
                    <div className="num text-[18px] text-honey">
                      +{fmtMoney(g.cutTotal, symbol)}
                    </div>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() =>
                        setConfirmDel({
                          type: "round",
                          id: g.round_id,
                          label: `${fmtDate(g.date)} 這一局`,
                        })
                      }
                      className="w-11 h-11 rounded-full hover:bg-hint flex items-center justify-center text-ink-3 text-xl"
                      aria-label="刪除"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 ml-10">
                  {g.rows.map((row) => {
                    const amt = Number(row.amount) || 0;
                    return (
                      <div
                        key={row.id}
                        className="flex items-center justify-between text-[15px]"
                      >
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
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmDel}
        title="確認刪除"
        message={`確定要刪除「${confirmDel?.label ?? ""}」嗎？此動作無法復原。`}
        confirmText="刪除"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-12 text-ink-3">
      <div className="text-5xl mb-3">{icon}</div>
      <div className="text-[18px]">{text}</div>
    </div>
  );
}
