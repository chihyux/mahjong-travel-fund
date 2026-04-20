import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { calcBalance, fmtDate, fmtMoney, todayISO } from '../lib/utils';
import type { Withdrawal } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';

interface WithdrawalForm {
  date: string;
  amount: string;
  note: string;
}

export default function Withdrawals() {
  const { data, actions } = useStore();
  const { tsumos, rounds, withdrawals, settings } = data;
  const symbol = settings.currency_symbol || '$';

  const { balance, out } = calcBalance(tsumos, rounds, withdrawals);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<WithdrawalForm>({
    date: todayISO(),
    amount: '',
    note: ''
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Withdrawal | null>(null);

  const list = [...(withdrawals ?? [])].sort(
    (a, b) =>
      new Date(b.created_at || b.date).getTime() -
      new Date(a.created_at || a.date).getTime()
  );

  const openAdd = () => {
    setForm({ date: todayISO(), amount: '', note: '' });
    setAddOpen(true);
  };

  const submit = async () => {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    try {
      await actions.addWithdrawal({
        date: form.date,
        amount,
        note: form.note
      });
      setAddOpen(false);
    } catch {
      // toast handled
    }
    setBusy(false);
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await actions.deleteWithdrawal(confirmDel.id);
    } catch {
      // toast handled
    }
    setConfirmDel(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-baseline justify-between mb-5">
          <h1 className="font-serif text-[24px] font-bold">旅遊支出</h1>
          <span className="text-[16px] text-ink-3">{list.length} 筆</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5 p-4 rounded-2xl bg-hint">
          <div>
            <div className="text-[16px] text-ink-3 mb-1">目前基金</div>
            <div className="num text-[22px]">{fmtMoney(balance, symbol)}</div>
          </div>
          <div>
            <div className="text-[16px] text-ink-3 mb-1">累計支出</div>
            <div className="num text-[22px] text-ink-2">{fmtMoney(out, symbol)}</div>
          </div>
        </div>

        <Button icon="🧳" onClick={openAdd}>
          記錄旅遊支出
        </Button>
      </Card>

      <Card>
        {list.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-5xl mb-3">🧳</div>
            <div className="text-[18px]">還沒有支出記錄</div>
          </div>
        ) : (
          <div className="divide-y divide-divider">
            {list.map((w) => (
              <div key={w.id} className="py-4 flex items-center gap-3">
                <div className="text-2xl">🧳</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[18px] font-medium truncate">
                    {w.note || '未標記用途'}
                  </div>
                  <div className="text-[15px] text-ink-3">{fmtDate(w.date)}</div>
                </div>
                <div className="num text-[20px] text-ink-2">−{fmtMoney(w.amount, symbol)}</div>
                <button
                  onClick={() => setConfirmDel(w)}
                  className="w-11 h-11 rounded-full hover:bg-red-50 flex items-center justify-center text-ink-3 text-xl"
                  aria-label="刪除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={addOpen} title="記錄旅遊支出" onClose={() => setAddOpen(false)} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-[18px] font-medium mb-2">日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[18px] font-medium mb-2">金額</label>
            <input
              type="number"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
              min="1"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[18px] font-medium mb-2">用途</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="例如：京都機票訂金"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="md" onClick={() => setAddOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button size="md" onClick={submit} disabled={busy || !Number(form.amount)}>
              {busy ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        title="確認刪除"
        message={`確定要刪除「${confirmDel?.note || '此筆'}」支出記錄嗎？此動作無法復原。`}
        confirmText="刪除"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
