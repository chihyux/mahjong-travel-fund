import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { asBool, fmtMoney, recentTsumoPlayers, todayISO } from '../lib/utils';
import type { Id } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Stepper from './ui/Stepper';
import PlayerChips from './ui/PlayerChips';

const TSUMO_AMOUNT = 30;

interface AddTsumoProps {
  onDone: () => void;
}

export default function AddTsumo({ onDone }: AddTsumoProps) {
  const { data, actions } = useStore();
  const { players, tsumos, settings } = data;
  const symbol = settings.currency_symbol || '$';

  const activePlayers = players.filter((p) => asBool(p.active));
  const recent = recentTsumoPlayers(tsumos, 3);

  const [date, setDate] = useState(todayISO());
  const [playerId, setPlayerId] = useState<Id | null>(null);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const total = TSUMO_AMOUNT * count;

  const submit = async () => {
    if (!playerId) return;
    setBusy(true);
    try {
      await actions.addTsumo({ date, player_id: playerId, count, note });
      onDone();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-3xl">🀄</span>
          <h1 className="font-serif text-[24px] font-bold">記錄自摸</h1>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[18px] font-medium mb-2">日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">誰自摸？</label>
            {activePlayers.length === 0 ? (
              <div className="p-4 rounded-xl bg-hint text-ink-3 text-[16px]">
                還沒有玩家，請先到「玩家」分頁新增
              </div>
            ) : (
              <PlayerChips
                players={activePlayers}
                value={playerId}
                onChange={setPlayerId}
                recentIds={recent}
              />
            )}
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">次數</label>
            <Stepper value={count} onChange={setCount} min={1} max={20} />
            <div className="text-[15px] text-ink-3 mt-2">
              大部分情況是 1，若一次記多局可按 ＋
            </div>
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">備註（選填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：大三元、槓上開花"
            />
          </div>

          <div className="p-5 rounded-2xl bg-sage/10 border-2 border-sage/30">
            <div className="text-[16px] text-sage-deep font-medium mb-1">本次捐款</div>
            <div className="num text-[36px] text-sage-deep">{fmtMoney(total, symbol)}</div>
            <div className="text-[15px] text-ink-3 mt-1">
              {fmtMoney(TSUMO_AMOUNT, symbol)} × {count}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" size="md" onClick={onDone} disabled={busy}>
              取消
            </Button>
            <Button onClick={submit} size="md" disabled={busy || !playerId}>
              {busy ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
