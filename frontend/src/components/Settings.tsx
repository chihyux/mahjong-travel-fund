import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { isNameTaken, purposeLabels } from '../lib/utils';
import type { SettingsMap } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';

interface SettingsForm {
  name: string;
  goal_name: string;
  goal: string;
}

const formFrom = (settings: SettingsMap): SettingsForm => ({
  name: settings.name,
  goal_name: settings.goal_name,
  goal: settings.goal == null ? '' : String(settings.goal)
});

export default function Settings() {
  const { data, ledgers, ledgerId, actions } = useStore();
  const { settings } = data;

  const labels = purposeLabels(settings.purpose);

  const [form, setForm] = useState<SettingsForm>(() => formFrom(settings));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(formFrom(settings));
  }, [settings]);

  // 改到一半就切換帳本會被新帳本的值蓋掉，先確認
  const saved = formFrom(settings);
  const isDirty =
    form.name !== saved.name || form.goal_name !== saved.goal_name || form.goal !== saved.goal;
  const { setLedgerSwitchBlocked } = actions;
  useEffect(() => {
    setLedgerSwitchBlocked(isDirty);
  }, [isDirty, setLedgerSwitchBlocked]);
  useEffect(() => () => setLedgerSwitchBlocked(false), [setLedgerSwitchBlocked]);

  const nameBlank = !form.name.trim();
  const nameTaken = !nameBlank && isNameTaken(ledgers, form.name, ledgerId ?? undefined);

  const saveBasic = async () => {
    if (nameBlank || nameTaken) return;
    setBusy(true);
    try {
      await actions.updateLedger({
        name: form.name,
        goal_name: form.goal_name,
        goal: Number(form.goal) || 0
      });
    } catch {
      // toast handled
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="font-serif text-[24px] font-bold mb-5">基本設定</h1>
        <div className="space-y-5">
          <div>
            <label className="block text-[18px] font-medium mb-2">群組名稱</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {(nameBlank || nameTaken) && (
              <p className="text-[15px] text-red-700 mt-2">
                {nameBlank ? '帳本名稱不可空白' : '已有同名的帳本'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">{labels.goalNameField}</label>
            <input
              type="text"
              value={form.goal_name}
              onChange={(e) => setForm({ ...form, goal_name: e.target.value })}
              placeholder="例如：京都賞櫻 2026.04"
            />
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">目標金額</label>
            <input
              type="number"
              inputMode="numeric"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              placeholder="10000"
              min="0"
            />
          </div>

          <Button size="md" onClick={saveBasic} disabled={busy || nameBlank || nameTaken}>
            {busy ? '儲存中…' : '儲存基本設定'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-[22px] font-bold mb-3">帳戶</h2>
        <p className="text-[16px] text-ink-3 mb-4 leading-relaxed">
          登出後仍可繼續瀏覽（以訪客身份）。管理員操作需重新登入。
        </p>
        <Button size="md" variant="secondary" onClick={actions.logout}>
          登出管理員
        </Button>
      </Card>
    </div>
  );
}
