import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const StoreContext = createContext(null);
const PASSWORD_KEY = 'mtf_password';

export function StoreProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    players: [],
    tsumos: [],
    settlements: [],
    withdrawals: [],
    settings: {}
  });
  const [password, setPasswordState] = useState(() => {
    try { return localStorage.getItem(PASSWORD_KEY) || null; } catch { return null; }
  });
  const [toast, setToast] = useState(null);

  const isAdmin = !!password;

  const setPassword = useCallback((pw) => {
    try {
      if (pw) localStorage.setItem(PASSWORD_KEY, pw);
      else localStorage.removeItem(PASSWORD_KEY);
    } catch {}
    setPasswordState(pw);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getAll();
      setData(d);
    } catch (e) {
      setError(e.message || '讀取失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type, ts: Date.now() });
    setTimeout(() => setToast(null), 2400);
  }, []);

  const wrap = useCallback((fn, okMsg) => async (...args) => {
    if (!password) throw new Error('未登入');
    try {
      const r = await fn(password, ...args);
      await refresh();
      if (okMsg) showToast(okMsg);
      return r;
    } catch (e) {
      if (e.code === 'UNAUTHORIZED') {
        showToast('登入已失效，請重新登入', 'error');
        setPassword(null);
      } else {
        showToast(e.message || '操作失敗', 'error');
      }
      throw e;
    }
  }, [password, refresh, showToast, setPassword]);

  const actions = {
    login: async (pw) => {
      try {
        await api.login(pw);
        setPassword(pw);
        showToast('登入成功');
        return true;
      } catch (e) {
        showToast(e.message || '密碼錯誤', 'error');
        return false;
      }
    },
    logout: () => { setPassword(null); showToast('已登出'); },

    addPlayer: wrap((pw, name) => api.addPlayer(pw, name), '已新增玩家'),
    updatePlayer: wrap((pw, payload) => api.updatePlayer(pw, payload), '已更新'),
    deletePlayer: wrap((pw, id) => api.deletePlayer(pw, id), '已刪除'),

    addTsumo: wrap((pw, payload) => api.addTsumo(pw, payload), '已記錄自摸'),
    updateTsumo: wrap((pw, payload) => api.updateTsumo(pw, payload), '已更新'),
    deleteTsumo: wrap((pw, id) => api.deleteTsumo(pw, id), '已刪除'),

    addSettlement: wrap((pw, payload) => api.addSettlement(pw, payload), '已記錄結算'),
    updateSettlement: wrap((pw, payload) => api.updateSettlement(pw, payload), '已更新'),
    deleteSettlement: wrap((pw, id) => api.deleteSettlement(pw, id), '已刪除'),

    addWithdrawal: wrap((pw, payload) => api.addWithdrawal(pw, payload), '已記錄支出'),
    deleteWithdrawal: wrap((pw, id) => api.deleteWithdrawal(pw, id), '已刪除'),

    updateSettings: wrap((pw, settings) => api.updateSettings(pw, settings), '已儲存設定'),

    refresh,
    showToast
  };

  return (
    <StoreContext.Provider value={{ loading, error, data, isAdmin, password, actions, toast }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
