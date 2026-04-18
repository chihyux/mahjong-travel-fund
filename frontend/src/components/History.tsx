import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { fmtDate, fmtMoney, playerName } from '../lib/utils';
import type { Id } from '../types';
import Card from './ui/Card';
import Segmented from './ui/Segmented';
import ConfirmDialog from './ui/ConfirmDialog';

type HistoryTab = 'tsumos' | 'settlements';
type DeleteType = 'tsumo' | 'settle';

interface PendingDelete {
  type: DeleteType;
  id: Id;
  label: string;
}

export default function History() {
  const { data, isAdmin, actions } = useStore();
  const { players, tsumos, settlements, settings } = data;
  const symbol = settings.currency_symbol || '$';

  const [tab, setTab] = useState<HistoryTab>('tsumos');
  const [confirmDel, setConfirmDel] = useState<PendingDelete | null>(null);

  const tsumoList = [...(tsumos ?? [])].sort(
    (a, b) =>
      new Date(b.created_at || b.date).getTime() -
      new Date(a.created_at || a.date).getTime()
  );
  const settleList = [...(settlements ?? [])].sort(
    (a, b) =>
      new Date(b.created_at || b.date).getTime() -
      new Date(a.created_at || a.date).getTime()
  );

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      if (confirmDel.type === 'tsumo') await actions.deleteTsumo(confirmDel.id);
      else await actions.deleteSettlement(confirmDel.id);
    } catch {
      // 錯誤由 store 的 wrap 顯示 toast
    }
    setConfirmDel(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <Segmented<HistoryTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tsumos', label: `🀄 自摸 (${tsumoList.length})` },
            { value: 'settlements', label: `💰 結算 (${settleList.length})` }
          ]}
        />
      </Card>

      <Card>
        {tab === 'tsumos' ? (
          tsumoList.length === 0 ? (
            <Empty icon="🀄" text="還沒有自摸記錄" />
          ) : (
            <div className="divide-y divide-divider">
              {tsumoList.map((t) => (
                <div key={t.id} className="py-4 flex items-center gap-3">
                  <div className="text-2xl">🀄</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[18px] font-medium">
                      {playerName(players, t.player_id)}
                      {Number(t.count) > 1 && (
                        <span className="text-ink-3 ml-1">× {String(t.count)}</span>
                      )}
                    </div>
                    <div className="text-[15px] text-ink-3">
                      {fmtDate(t.date)}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                  </div>
                  <div className="num text-[20px] text-sage-deep">+{fmtMoney(t.amount, symbol)}</div>
                  {isAdmin && (
                    <button
                      onClick={() =>
                        setConfirmDel({
                          type: 'tsumo',
                          id: t.id,
                          label: `${playerName(players, t.player_id)} 的自摸`
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
        ) : settleList.length === 0 ? (
          <Empty icon="💰" text="還沒有結算記錄" />
        ) : (
          <div className="divide-y divide-divider">
            {settleList.map((s) => (
              <div key={s.id} className="py-4 flex items-center gap-3">
                <div className="text-2xl">💰</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[18px] font-medium">{playerName(players, s.player_id)}</div>
                  <div className="text-[15px] text-ink-3">
                    {fmtDate(s.date)}
                    {s.win_amount ? ` · 贏 ${fmtMoney(s.win_amount, symbol)}` : ''}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <div className="num text-[20px] text-honey">+{fmtMoney(s.cut_amount, symbol)}</div>
                {isAdmin && (
                  <button
                    onClick={() =>
                      setConfirmDel({
                        type: 'settle',
                        id: s.id,
                        label: `${playerName(players, s.player_id)} 的結算`
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
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmDel}
        title="確認刪除"
        message={`確定要刪除「${confirmDel?.label ?? ''}」嗎？此動作無法復原。`}
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
