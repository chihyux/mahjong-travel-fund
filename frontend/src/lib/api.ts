import { API_URL } from '../config';
import type {
  ApiResponse,
  ApiSuccess,
  Id,
  LedgerUpdatePayload,
  PlayerUpdatePayload,
  RoundWithTsumosPayload,
  Snapshot,
  WithdrawalPayload
} from '../types';
import { ApiError } from '../types';

async function parseEnvelope<T>(res: Response): Promise<ApiSuccess<T>> {
  if (!res.ok) throw new ApiError('Network error: ' + res.status);
  const data = (await res.json()) as ApiResponse<T>;
  if (!data.ok) {
    throw new ApiError(data.error ?? 'Unknown error', data.code);
  }
  return data;
}

async function parse<T>(res: Response): Promise<T> {
  return (await parseEnvelope<T>(res)).data;
}

// Apps Script 執行完會轉址到 script.googleusercontent.com 取結果，這一段偶爾卡住不回應；
// 正常一次往返 2～3 秒，超過這個時間就當作卡住
const TIMEOUT_MS = 15_000;
export const TIMEOUT_CODE = 'TIMEOUT';

// 整個請求連同讀 body 都算在時限內，body 傳到一半卡住也會中止
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, message: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await run(ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted) throw new ApiError(message, TIMEOUT_CODE);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 只用在不會改資料的請求：逾時重送一次
async function retryOnTimeout<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.code === TIMEOUT_CODE) return fn();
    throw e;
  }
}

const READ_TIMEOUT_MSG = '連線逾時，請再試一次';
// 後端可能已經寫入只是結果沒傳回來，不能自動重送，否則會寫兩次
const WRITE_TIMEOUT_MSG = '連線逾時，資料可能已寫入，正在重新確認';

function getAllOnce(fresh = false): Promise<Snapshot> {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'getAll');
  if (fresh) url.searchParams.set('fresh', '1');
  // 瀏覽器會讓網址完全相同的 GET 排在前一個後面；前一個卡住時重送也會跟著卡，所以每次網址都不同
  url.searchParams.set('_', String(Date.now()));
  return withTimeout(
    async (signal) => parse<Snapshot>(await fetch(url.toString(), { signal })),
    READ_TIMEOUT_MSG
  );
}

function postRaw(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  return fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    redirect: 'follow',
    signal
  });
}

function login(password: string): Promise<unknown> {
  return retryOnTimeout(() =>
    withTimeout(
      async (signal) => parse<unknown>(await postRaw({ action: 'login', password }, signal)),
      READ_TIMEOUT_MSG
    )
  );
}

// 寫入動作回傳後端附上的最新資料，沒有時為 undefined，由呼叫端自己再讀
function write(body: Record<string, unknown>): Promise<Snapshot | undefined> {
  return withTimeout(
    async (signal) => (await parseEnvelope<unknown>(await postRaw(body, signal))).snapshot,
    WRITE_TIMEOUT_MSG
  );
}

// index.html 提早發出的請求沒有 AbortSignal，逾時只能不再等它
function abandonOnAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
    promise.then(resolve, reject);
  });
}

// 只接手一次；之後的重新整理都要重新讀
function consumePrefetch(): Promise<Snapshot> | undefined {
  const pending = window.__mtfPrefetch;
  if (!pending) return undefined;
  window.__mtfPrefetch = undefined;
  return withTimeout(
    (signal) => abandonOnAbort(pending.then((res) => parse<Snapshot>(res)), signal),
    READ_TIMEOUT_MSG
  );
}

function getAll(): Promise<Snapshot> {
  const prefetched = consumePrefetch();
  if (!prefetched) return retryOnTimeout(getAllOnce);
  return prefetched.catch((e: unknown) => {
    if (e instanceof ApiError && e.code === TIMEOUT_CODE) return getAllOnce();
    throw e;
  });
}

// 帳本層級的寫入都帶 ledger_id，後端依它選 Rounds__L* 等分頁
export const api = {
  getAll,
  // 寫入逾時後用：後端會等寫入做完才回，不會拿到寫入前的快取。不重送，失敗由呼叫端提示
  getAllAfterWrite: () => getAllOnce(true),
  login,

  addPlayer: (password: string, ledger_id: Id, name: string) =>
    write({ action: 'addPlayer', password, ledger_id, name }),
  updatePlayer: (password: string, payload: PlayerUpdatePayload) =>
    write({ action: 'updatePlayer', password, ...payload }),
  addMembers: (password: string, ledger_id: Id, player_ids: Id[]) =>
    write({ action: 'addMembers', password, ledger_id, player_ids }),
  setMemberActive: (password: string, ledger_id: Id, player_id: Id, active: boolean) =>
    write({ action: 'setMemberActive', password, ledger_id, player_id, active }),

  deleteTsumo: (password: string, ledger_id: Id, id: Id) =>
    write({ action: 'deleteTsumo', password, ledger_id, id }),

  addRoundWithTsumos: (password: string, ledger_id: Id, payload: RoundWithTsumosPayload) =>
    write({ action: 'addRoundWithTsumos', password, ledger_id, ...payload }),
  deleteRound: (password: string, ledger_id: Id, round_id: Id) =>
    write({ action: 'deleteRound', password, ledger_id, round_id }),
  markWeekSettled: (password: string, ledger_id: Id, week_start: string, settled: boolean) =>
    write({ action: 'markWeekSettled', password, ledger_id, week_start, settled }),

  addWithdrawal: (password: string, ledger_id: Id, payload: WithdrawalPayload) =>
    write({ action: 'addWithdrawal', password, ledger_id, ...payload }),
  deleteWithdrawal: (password: string, ledger_id: Id, id: Id) =>
    write({ action: 'deleteWithdrawal', password, ledger_id, id }),

  updateLedger: (password: string, ledger_id: Id, payload: LedgerUpdatePayload) =>
    write({ action: 'updateLedger', password, ledger_id, ...payload })
};
