import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { api, TIMEOUT_CODE } from '../lib/api';
import { buildLedgerView, resolveLedgerId } from '../lib/utils';
import {
  ApiError,
  type AppData,
  type GlobalPlayer,
  type Id,
  type LedgerOption,
  type LedgerUpdatePayload,
  type PlayerUpdatePayload,
  type RoundWithTsumosPayload,
  type Snapshot,
  type ToastMessage,
  type ToastType,
  type WithdrawalPayload
} from '../types';

const PASSWORD_KEY = 'mtf_password';
const LEDGER_KEY = 'mtf_ledger';

interface StoreActions {
  // 'error' 是連線問題（例如逾時），不是密碼錯，畫面不該叫使用者重打密碼
  login: (pw: string) => Promise<'ok' | 'invalid' | 'error'>;
  logout: () => void;

  selectLedger: (id: Id) => void;
  // 每局結算或設定頁有未送出的內容時設為 true，切換帳本前要先確認
  setLedgerSwitchBlocked: (blocked: boolean) => void;

  addPlayer: (name: string) => Promise<unknown>;
  updatePlayer: (payload: PlayerUpdatePayload) => Promise<unknown>;
  addMembers: (playerIds: Id[]) => Promise<unknown>;
  setMemberActive: (playerId: Id, active: boolean) => Promise<unknown>;

  deleteTsumo: (id: Id) => Promise<unknown>;

  addRoundWithTsumos: (payload: RoundWithTsumosPayload) => Promise<unknown>;
  deleteRound: (round_id: Id) => Promise<unknown>;
  markWeekSettled: (weekStart: string, settled: boolean) => Promise<unknown>;

  addWithdrawal: (payload: WithdrawalPayload) => Promise<unknown>;
  deleteWithdrawal: (id: Id) => Promise<unknown>;

  updateLedger: (payload: LedgerUpdatePayload) => Promise<unknown>;

  refresh: () => Promise<void>;
  showToast: (msg: string, type?: ToastType) => void;
}

interface StoreContextValue {
  loading: boolean;
  error: string | null;
  data: AppData; // 目前帳本的資料視圖
  ledgers: LedgerOption[];
  ledgerId: Id | null;
  allPlayers: GlobalPlayer[];
  ledgerSwitchBlocked: boolean;
  writing: boolean; // 有寫入請求還沒回來
  isAdmin: boolean;
  password: string | null;
  actions: StoreActions;
  toast: ToastMessage | null;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const emptySnapshot = (): Snapshot => ({
  settings: {},
  players: [],
  ledgers: []
});

const emptyData = (): AppData => ({
  players: [],
  tsumos: [],
  rounds: [],
  withdrawals: [],
  settings: {
    name: '',
    purpose: '',
    goal: 0,
    goal_name: '',
    tsumo_amount: 0,
    cut_ratio: 0,
    settle_weekday: 0,
    currency_symbol: '$'
  }
});

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // localStorage 不可用時靜默忽略
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [password, setPasswordState] = useState<string | null>(() => readStored(PASSWORD_KEY));
  const [storedLedgerId, setStoredLedgerId] = useState<string | null>(() =>
    readStored(LEDGER_KEY)
  );
  const [ledgerSwitchBlocked, setLedgerSwitchBlocked] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const isAdmin = !!password;
  const ledgerId = resolveLedgerId(snapshot.ledgers, storedLedgerId);
  const data = useMemo(
    () => buildLedgerView(snapshot, ledgerId) ?? emptyData(),
    [snapshot, ledgerId]
  );
  const ledgers = useMemo<LedgerOption[]>(
    () => snapshot.ledgers.map((l) => ({ id: l.id, name: l.name })),
    [snapshot]
  );

  const setPassword = useCallback((pw: string | null) => {
    writeStored(PASSWORD_KEY, pw);
    setPasswordState(pw);
  }, []);

  const selectLedger = useCallback((id: Id) => {
    writeStored(LEDGER_KEY, id);
    setStoredLedgerId(id);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getAll();
      setSnapshot(d);
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

  // 不走 refresh：refresh 失敗會把整個畫面換成錯誤頁，正在填的表單會不見
  const resyncAfterWriteTimeout = useCallback(async () => {
    try {
      setSnapshot(await api.getAllAfterWrite());
      showToast('已重新讀取最新資料，請確認剛才的操作有沒有成功');
    } catch {
      showToast('還是讀不到最新資料，請稍後重新整理確認，不要重複送出', 'error');
    }
  }, [showToast]);

  const wrap = useCallback(
    <Args extends unknown[]>(
      fn: (pw: string, ...args: Args) => Promise<Snapshot | undefined>,
      okMsg?: string
    ) =>
      async (...args: Args): Promise<void> => {
        if (!password) throw new ApiError('未登入');
        setPendingWrites((n) => n + 1);
        try {
          const snap = await fn(password, ...args);
          if (snap) setSnapshot(snap);
          else await refresh();
          if (okMsg) showToast(okMsg);
        } catch (e) {
          if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
            showToast('登入已失效，請重新登入', 'error');
            setPassword(null);
          } else {
            const msg = e instanceof Error ? e.message : '操作失敗';
            showToast(msg || '操作失敗', 'error');
            // 逾時時後端可能已經寫入，重讀一次讓畫面跟上，免得使用者以為沒存又送一次
            if (e instanceof ApiError && e.code === TIMEOUT_CODE) void resyncAfterWriteTimeout();
          }
          throw e;
        } finally {
          setPendingWrites((n) => n - 1);
        }
      },
    [password, refresh, showToast, setPassword, resyncAfterWriteTimeout]
  );

  const requireLedgerId = (): Id => {
    if (!ledgerId) throw new ApiError('尚未選擇帳本');
    return ledgerId;
  };

  const actions: StoreActions = {
    login: async (pw) => {
      try {
        await api.login(pw);
        setPassword(pw);
        showToast('登入成功');
        return 'ok';
      } catch (e) {
        const msg = e instanceof Error ? e.message : '密碼錯誤';
        showToast(msg || '密碼錯誤', 'error');
        return e instanceof ApiError && e.code === 'INVALID_PASSWORD' ? 'invalid' : 'error';
      }
    },
    logout: () => {
      setPassword(null);
      showToast('已登出');
    },

    selectLedger,
    setLedgerSwitchBlocked,

    addPlayer: wrap(
      (pw, name: string) => api.addPlayer(pw, requireLedgerId(), name),
      '已新增玩家'
    ),
    updatePlayer: wrap(
      (pw, payload: PlayerUpdatePayload) => api.updatePlayer(pw, payload),
      '已更新'
    ),
    addMembers: wrap(
      (pw, playerIds: Id[]) => api.addMembers(pw, requireLedgerId(), playerIds),
      '已拉入玩家'
    ),
    setMemberActive: wrap(
      (pw, playerId: Id, active: boolean) =>
        api.setMemberActive(pw, requireLedgerId(), playerId, active),
      '已更新'
    ),

    deleteTsumo: wrap((pw, id: Id) => api.deleteTsumo(pw, requireLedgerId(), id), '已刪除'),

    addRoundWithTsumos: wrap(
      (pw, payload: RoundWithTsumosPayload) =>
        api.addRoundWithTsumos(pw, requireLedgerId(), payload),
      '已記錄本局'
    ),
    deleteRound: wrap(
      (pw, round_id: Id) => api.deleteRound(pw, requireLedgerId(), round_id),
      '已刪除'
    ),
    markWeekSettled: wrap(
      (pw, weekStart: string, settled: boolean) =>
        api.markWeekSettled(pw, requireLedgerId(), weekStart, settled),
      '已更新結算狀態'
    ),

    addWithdrawal: wrap(
      (pw, payload: WithdrawalPayload) => api.addWithdrawal(pw, requireLedgerId(), payload),
      '已記錄支出'
    ),
    deleteWithdrawal: wrap(
      (pw, id: Id) => api.deleteWithdrawal(pw, requireLedgerId(), id),
      '已刪除'
    ),

    updateLedger: wrap(
      (pw, payload: LedgerUpdatePayload) => api.updateLedger(pw, requireLedgerId(), payload),
      '已儲存設定'
    ),

    refresh,
    showToast
  };

  const value: StoreContextValue = {
    loading,
    error,
    data,
    ledgers,
    ledgerId,
    allPlayers: snapshot.players,
    ledgerSwitchBlocked,
    writing: pendingWrites > 0,
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
