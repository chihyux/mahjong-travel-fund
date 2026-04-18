import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import Card from './ui/Card';
import Button from './ui/Button';

export default function Login({ onDone }) {
  const { actions, data } = useStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setErrMsg('');
    const ok = await actions.login(password.trim());
    setBusy(false);
    if (ok) {
      onDone();
    } else {
      setErrMsg('密碼錯誤，請重新輸入');
      setPassword('');
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🌿</div>
          <h1 className="font-serif text-[28px] font-bold">
            {data.settings.group_name || '家庭旅遊基金'}
          </h1>
          <p className="text-[16px] text-ink-3 mt-1">管理員登入</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[18px] font-medium mb-2">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errMsg) setErrMsg(''); }}
              autoFocus
              placeholder="請輸入管理員密碼"
              aria-invalid={!!errMsg}
            />
            {errMsg && (
              <div role="alert" className="mt-2 text-[15px] text-red-700">
                {errMsg}
              </div>
            )}
          </div>

          <Button type="submit" disabled={busy || !password.trim()}>
            {busy ? '驗證中…' : '登入'}
          </Button>

          <button
            type="button"
            onClick={onDone}
            className="w-full text-center text-[16px] text-ink-3 underline underline-offset-4 py-2"
          >
            以訪客身份返回
          </button>
        </form>
      </Card>
    </div>
  );
}
