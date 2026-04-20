import { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  asBool,
  fmtMoney,
  fmtSignedMoney,
  playerName,
  roundCutFor,
  todayISO,
  validateRoundEntries
} from '../lib/utils';
import type { Id, Player } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface AddRoundProps {
  onDone: () => void;
}

interface SlotState {
  player_id: Id | null;
  amountInput: string; // 允許空字串/「-」等暫態
}

const emptySlot = (): SlotState => ({ player_id: null, amountInput: '' });

export default function AddRound({ onDone }: AddRoundProps) {
  const { data, actions } = useStore();
  const { players, settings } = data;
  const symbol = settings.currency_symbol || '$';
  const cutRatio = Number(settings.cut_ratio) || 0.1;

  const activePlayers = players.filter((p) => asBool(p.active));

  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<SlotState[]>(() => [
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot()
  ]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const entries = useMemo(
    () =>
      slots.map((s) => ({
        player_id: s.player_id ?? '',
        amount: Number(s.amountInput) || 0
      })),
    [slots]
  );

  const validation = useMemo(() => {
    // validateRoundEntries 要求 player_id 都存在；未選齊時先給 reason
    const hasAll = slots.every((s) => !!s.player_id);
    if (!hasAll) {
      const diff = entries.reduce((sum, e) => sum + e.amount, 0);
      return { ok: false, diff, reason: '玩家未選齊' };
    }
    return validateRoundEntries(entries);
  }, [entries, slots]);

  const cutTotal = useMemo(
    () => entries.reduce((s, e) => s + roundCutFor(e.amount, cutRatio), 0),
    [entries, cutRatio]
  );

  const winners = entries.filter((e) => e.amount > 0);
  const losers = entries.filter((e) => e.amount < 0);

  const setSlot = (idx: number, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const usedIds = new Set(slots.map((s) => s.player_id).filter((x): x is Id => !!x));

  const pickerTaken = (slotIdx: number): Set<Id> => {
    const t = new Set(usedIds);
    const mine = slots[slotIdx]?.player_id;
    if (mine) t.delete(mine);
    return t;
  };

  const submit = async () => {
    if (!validation.ok) return;
    setBusy(true);
    try {
      await actions.addRound({
        date,
        entries: slots.map((s) => ({
          player_id: s.player_id as Id,
          amount: Number(s.amountInput) || 0
        })),
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
          <span className="text-3xl">🀄</span>
          <h1 className="font-serif text-[24px] font-bold">每局結算</h1>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-[18px] font-medium mb-2">日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {activePlayers.length < 4 ? (
            <div className="p-4 rounded-xl bg-hint text-ink-3 text-[16px]">
              需要至少 4 位 active 玩家，請先到「玩家」分頁新增
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-[18px] font-medium">四位玩家輸贏</label>
              {slots.map((slot, idx) => (
                <div key={idx} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerFor(idx)}
                    className="press flex-1 min-h-[56px] px-4 rounded-xl border-2 border-divider bg-white text-left text-[17px] flex items-center justify-between"
                  >
                    <span className={slot.player_id ? 'font-medium' : 'text-ink-3'}>
                      {slot.player_id
                        ? playerName(players, slot.player_id)
                        : `選擇玩家 ${idx + 1}`}
                    </span>
                    <span className="text-ink-3 text-xl">›</span>
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="金額"
                    value={slot.amountInput}
                    onChange={(e) => setSlot(idx, { amountInput: e.target.value })}
                    className="!w-28 text-right num"
                    aria-label={`玩家 ${idx + 1} 金額`}
                  />
                </div>
              ))}
              <div className="text-[14px] text-ink-3">
                贏家輸入正數、輸家輸入負數；4 人總和需為 0
              </div>
            </div>
          )}

          <div>
            <label className="block text-[18px] font-medium mb-2">備註（選填）</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：第 1 圈、大三元"
            />
          </div>

          <div className="p-5 rounded-2xl bg-honey/10 border-2 border-honey/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-medium">差額</span>
              <span
                className={`num text-[20px] ${
                  validation.diff === 0 ? 'text-sage-deep' : 'text-red-700'
                }`}
              >
                {validation.diff === 0 ? '0 ✓' : fmtSignedMoney(validation.diff, symbol)}
              </span>
            </div>

            {(winners.length > 0 || losers.length > 0) && (
              <div className="text-[14px] text-ink-2 space-y-1">
                {winners.length > 0 && (
                  <div>
                    贏家：
                    {winners
                      .map((w) => {
                        const p = slots.find((s) => s.player_id === w.player_id);
                        const name = p?.player_id
                          ? playerName(players, p.player_id)
                          : '';
                        return `${name} ${fmtSignedMoney(w.amount, symbol)}`;
                      })
                      .join('、')}
                  </div>
                )}
                {losers.length > 0 && (
                  <div>
                    輸家：
                    {losers
                      .map((l) => {
                        const p = slots.find((s) => s.player_id === l.player_id);
                        const name = p?.player_id
                          ? playerName(players, p.player_id)
                          : '';
                        return `${name} ${fmtSignedMoney(l.amount, symbol)}`;
                      })
                      .join('、')}
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-honey/30">
              <div className="flex items-baseline justify-between">
                <span className="text-[16px] text-honey font-medium">入公基金</span>
                <span className="num text-[28px] text-honey">
                  {fmtMoney(cutTotal, symbol)}
                </span>
              </div>
              <div className="text-[13px] text-ink-3 mt-1">
                自動計算贏家金額 {Math.round(cutRatio * 100)}%
              </div>
            </div>

            {!validation.ok && validation.reason && (
              <div className="text-[14px] text-red-700">⚠ {validation.reason}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="secondary" size="md" onClick={onDone} disabled={busy}>
              取消
            </Button>
            <Button
              onClick={submit}
              size="md"
              variant="honey"
              disabled={busy || !validation.ok}
            >
              {busy ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </Card>

      <PlayerPickerModal
        open={pickerFor !== null}
        players={activePlayers}
        takenIds={pickerFor !== null ? pickerTaken(pickerFor) : new Set()}
        onPick={(id) => {
          if (pickerFor !== null) setSlot(pickerFor, { player_id: id });
          setPickerFor(null);
        }}
        onClose={() => setPickerFor(null)}
      />
    </div>
  );
}

interface PlayerPickerModalProps {
  open: boolean;
  players: Player[];
  takenIds: Set<Id>;
  onPick: (id: Id) => void;
  onClose: () => void;
}

function PlayerPickerModal({
  open,
  players,
  takenIds,
  onPick,
  onClose
}: PlayerPickerModalProps) {
  return (
    <Modal open={open} title="選擇玩家" onClose={onClose} size="sm">
      <div className="flex flex-wrap gap-2">
        {players.map((p) => {
          const taken = takenIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={taken}
              onClick={() => onPick(p.id)}
              className={`press min-h-[56px] px-5 rounded-2xl text-[18px] font-medium border-2 transition-colors ${
                taken
                  ? 'bg-hint text-ink-3 border-divider line-through'
                  : 'bg-white text-ink border-divider hover:border-sage'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
