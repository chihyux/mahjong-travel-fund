import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import { api } from '../lib/api';
import {
  ApiError,
  type AppData,
  type Id,
  type PlayerUpdatePayload,
  type SettingsMap,
  type SettlementPayload,
  type SettlementUpdatePayload,
  type ToastMessage,
  type ToastType,
  type TsumoPayload,
  type TsumoUpdatePayload,
  type WithdrawalPayload
} from '../types';

const PASSWORD_KEY = 'mtf_password';

interface StoreActions {
  login: (pw: string) => Promise<boolean>;
  logout: () => void;

  addPlayer: (name: string) => Promise<unknown>;
  updatePlayer: (payload: PlayerUpdatePayload) => Promise<unknown>;
  deletePlayer: (id: Id) => Promise<unknown>;

  addTsumo: (payload: TsumoPayload) => Promise<unknown>;
  updateTsumo: (payload: TsumoUpdatePayload) => Promise<unknown>;
  deleteTsumo: (id: Id) => Promise<unknown>;

  addSettlement: (payload: SettlementPayload) => Promise<unknown>;
  updateSettlement: (payload: SettlementUpdatePayload) => Promise<unknown>;
  deleteSettlement: (id: Id) => Promise<unknown>;

  addWithdrawal: (payload: WithdrawalPayload) => Promise<unknown>;
  deleteWithdrawal: (id: Id) => Promise<unknown>;

  updateSettings: (settings: Partial<SettingsMap>) => Promise<unknown>;

  refresh: () => Promise<void>;
  showToast: (msg: string, type?: ToastType) => void;
}

interface StoreContextValue {
  loading: boolean;
  error: string | null;
  data: AppData;
  isAdmin: boolean;
  password: string | null;
  actions: StoreActions;
  toast: ToastMessage | null;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const emptyData = (): AppData => ({
  players: [],
  tsumos: [],
  settlements: [],
  withdrawals: [],
  settings: {}
});

function readStoredPassword(): string | null {
  try {
    return localStorage.getItem(PASSWORD_KEY);
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [password, setPasswordState] = useState<string | null>(readStoredPassword);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const isAdmin = !!password;

  const setPassword = useCallback((pw: string | null) => {
    try {
      if (pw) localStorage.setItem(PASSWORD_KEY, pw);
      else localStorage.removeItem(PASSWORD_KEY);
    } catch {
      // localStorage unavailable — 靜默忽略
    }
    setPasswordState(pw);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getAll();
      setData(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '讀取失敗';
      setError(msg || '讀取失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    setToast({ msg, type, ts: Date.now() });
    setTimeout(() => setToast(null), 2400);
  }, []);

  const wrap = useCallback(
    <Args extends unknown[], R>(
      fn: (pw: string, ...args: Args) => Promise<R>,
      okMsg?: string
    ) =>
      async (...args: Args): Promise<R> => {
        if (!password) throw new ApiError('未登入');
        try {
          const r = await fn(password, ...args);
          await refresh();
          if (okMsg) showToast(okMsg);
          return r;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
            showToast('登入已失效，請重新登入', 'error');
            setPassword(null);
          } else {
            const msg = e instanceof Error ? e.message : '操作失敗';
            showToast(msg || '操作失敗', 'error');
          }
          throw e;
        }
      },
    [password, refresh, showToast, setPassword]
  );

  const actions: StoreActions = {
    login: async (pw) => {
      try {
        await api.login(pw);
        setPassword(pw);
        showToast('登入成功');
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '密碼錯誤';
        showToast(msg || '密碼錯誤', 'error');
        return false;
      }
    },
    logout: () => {
      setPassword(null);
      showToast('已登出');
    },

    addPlayer: wrap((pw, name: string) => api.addPlayer(pw, name), '已新增玩家'),
    updatePlayer: wrap(
      (pw, payload: PlayerUpdatePayload) => api.updatePlayer(pw, payload),
      '已更新'
    ),
    deletePlayer: wrap((pw, id: Id) => api.deletePlayer(pw, id), '已刪除'),

    addTsumo: wrap(
      (pw, payload: TsumoPayload) => api.addTsumo(pw, payload),
      '已記錄自摸'
    ),
    updateTsumo: wrap(
      (pw, payload: TsumoUpdatePayload) => api.updateTsumo(pw, payload),
      '已更新'
    ),
    deleteTsumo: wrap((pw, id: Id) => api.deleteTsumo(pw, id), '已刪除'),

    addSettlement: wrap(
      (pw, payload: SettlementPayload) => api.addSettlement(pw, payload),
      '已記錄結算'
    ),
    updateSettlement: wrap(
      (pw, payload: SettlementUpdatePayload) => api.updateSettlement(pw, payload),
      '已更新'
    ),
    deleteSettlement: wrap((pw, id: Id) => api.deleteSettlement(pw, id), '已刪除'),

    addWithdrawal: wrap(
      (pw, payload: WithdrawalPayload) => api.addWithdrawal(pw, payload),
      '已記錄支出'
    ),
    deleteWithdrawal: wrap((pw, id: Id) => api.deleteWithdrawal(pw, id), '已刪除'),

    updateSettings: wrap(
      (pw, settings: Partial<SettingsMap>) => api.updateSettings(pw, settings),
      '已儲存設定'
    ),

    refresh,
    showToast
  };

  const value: StoreContextValue = {
    loading,
    error,
    data,
    isAdmin,
    password,
    actions,
    toast
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
