import { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { asBool, fmtMoney, todayISO } from '../lib/utils';
import type { Id } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Segmented from './ui/Segmented';
import PlayerChips from './ui/PlayerChips';

const CUT_RATIO = 0.1;

type InputMode = 'win' | 'cut';

interface AddSettlementProps {
  onDone: () => void;
}

export default function AddSettlement({ onDone }: AddSettlementProps) {
  const { data, actions } = useStore();
  const { players, settings } = data;
  const symbol = settings.currency_symbol || '$';

  const activePlayers = players.filter((p) => asBool(p.active));

  const [date, setDate] = useState(todayISO());
  const [playerId, setPlayerId] = useState<Id | null>(null);
  const [mode, setMode] = useState<InputMode>('win');
  const [winInput, setWinInput] = useState('');
  const [cutInput, setCutInput] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { win, cut } = useMemo(() => {
    if (mode === 'win') {
      const w = Number(winInput) || 0;
      return { win: w, cut: Math.round(w * CUT_RATIO) };
    }
    const c = Number(cutInput) || 0;
    return { win: Math.round(c / CUT_RATIO), cut: c };
  }, [mode, winInput, cutInput]);

  const canSubmit = !!playerId && cut > 0;

  const submit = async () => {
    if (!playerId || !canSubmit) return;
    setBusy(true);
    try {
      await actions.addSettlement({
        date,
        player_id: playerId,
        win_amount: win,
        cut_amount: cut,
        note
      });
      onDone();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <Card>
        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-3xl">💰</span>
          <h1 className="font-serif text-[24px] font-bold">週結算</h1>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[18px] font-medium mb-2">結算日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">誰的結算？</label>
            {activePlayers.length === 0 ? (
              <div className="p-4 rounded-xl bg-hint text-ink-3 text-[16px]">
                還沒有玩家，請先到「玩家」分頁新增
              </div>
            ) : (
              <PlayerChips players={activePlayers} value={playerId} onChange={setPlayerId} />
            )}
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">輸入方式</label>
            <Segmented<InputMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'win', label: '贏金額' },
                { value: 'cut', label: '10% 金額' }
              ]}
            />
          </div>

          {mode === 'win' ? (
            <div>
              <label className="block text-[18px] font-medium mb-2">這期贏了多少？</label>
              <input
                type="number"
                inputMode="numeric"
                value={winInput}
                onChange={(e) => setWinInput(e.target.value)}
                placeholder="0"
                min="0"
              />
              <div className="text-[15px] text-ink-3 mt-2">系統會自動計算 10% 捐款金額</div>
            </div>
          ) : (
            <div>
              <label className="block text-[18px] font-medium mb-2">10% 捐款金額</label>
              <input
                type="number"
                inputMode="numeric"
                value={cutInput}
                onChange={(e) => setCutInput(e.target.value)}
                placeholder="0"
                min="0"
              />
              <div className="text-[15px] text-ink-3 mt-2">
                對應贏金額約 {fmtMoney(win, symbol)}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[18px] font-medium mb-2">備註（選填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：2026 第 16 週"
            />
          </div>

          <div className="p-5 rounded-2xl bg-honey/10 border-2 border-honey/30">
            <div className="text-[16px] text-honey font-medium mb-1">入公基金</div>
            <div className="num text-[36px] text-honey">{fmtMoney(cut, symbol)}</div>
            {win > 0 && (
              <div className="text-[15px] text-ink-3 mt-1">
                該期贏金額 {fmtMoney(win, symbol)} × 10%
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" size="md" onClick={onDone} disabled={busy}>
              取消
            </Button>
            <Button onClick={submit} size="md" variant="honey" disabled={busy || !canSubmit}>
              {busy ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
