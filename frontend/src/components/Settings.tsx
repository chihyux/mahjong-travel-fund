import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import Card from './ui/Card';
import Button from './ui/Button';

interface SettingsForm {
  group_name: string;
  goal_name: string;
  goal: string;
}

export default function Settings() {
  const { data, actions } = useStore();
  const { settings } = data;

  const [form, setForm] = useState<SettingsForm>({
    group_name: '',
    goal_name: '',
    goal: ''
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      group_name: settings.group_name ?? '',
      goal_name: settings.goal_name ?? '',
      goal: settings.goal == null ? '' : String(settings.goal)
    });
  }, [settings]);

  const saveBasic = async () => {
    setBusy(true);
    try {
      await actions.updateSettings({
        group_name: form.group_name,
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
              value={form.group_name}
              onChange={(e) => setForm({ ...form, group_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[18px] font-medium mb-2">旅遊目標名稱</label>
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

          <Button size="md" onClick={saveBasic} disabled={busy}>
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
