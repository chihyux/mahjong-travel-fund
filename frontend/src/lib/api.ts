import { API_URL } from '../config';
import type {
  ApiResponse,
  Id,
  LedgerUpdatePayload,
  PlayerUpdatePayload,
  RoundWithTsumosPayload,
  Snapshot,
  WithdrawalPayload
} from '../types';
import { ApiError } from '../types';

type QueryParams = Record<string, string | number | boolean>;

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError('Network error: ' + res.status);
  const data = (await res.json()) as ApiResponse<T>;
  if (!data.ok) {
    throw new ApiError(data.error ?? 'Unknown error', data.code);
  }
  return data.data;
}

async function get<T>(params: QueryParams = {}): Promise<T> {
  const url = new URL(API_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  return parse<T>(res);
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  return parse<T>(res);
}

// 帳本層級的寫入都帶 ledger_id，後端依它選 Rounds__L* 等分頁
export const api = {
  getAll: () => get<Snapshot>({ action: 'getAll' }),
  login: (password: string) => post<unknown>({ action: 'login', password }),

  addPlayer: (password: string, ledger_id: Id, name: string) =>
    post<unknown>({ action: 'addPlayer', password, ledger_id, name }),
  updatePlayer: (password: string, payload: PlayerUpdatePayload) =>
    post<unknown>({ action: 'updatePlayer', password, ...payload }),
  addMembers: (password: string, ledger_id: Id, player_ids: Id[]) =>
    post<unknown>({ action: 'addMembers', password, ledger_id, player_ids }),
  setMemberActive: (password: string, ledger_id: Id, player_id: Id, active: boolean) =>
    post<unknown>({ action: 'setMemberActive', password, ledger_id, player_id, active }),

  deleteTsumo: (password: string, ledger_id: Id, id: Id) =>
    post<unknown>({ action: 'deleteTsumo', password, ledger_id, id }),

  addRoundWithTsumos: (password: string, ledger_id: Id, payload: RoundWithTsumosPayload) =>
    post<unknown>({ action: 'addRoundWithTsumos', password, ledger_id, ...payload }),
  deleteRound: (password: string, ledger_id: Id, round_id: Id) =>
    post<unknown>({ action: 'deleteRound', password, ledger_id, round_id }),
  markWeekSettled: (password: string, ledger_id: Id, week_start: string, settled: boolean) =>
    post<unknown>({ action: 'markWeekSettled', password, ledger_id, week_start, settled }),

  addWithdrawal: (password: string, ledger_id: Id, payload: WithdrawalPayload) =>
    post<unknown>({ action: 'addWithdrawal', password, ledger_id, ...payload }),
  deleteWithdrawal: (password: string, ledger_id: Id, id: Id) =>
    post<unknown>({ action: 'deleteWithdrawal', password, ledger_id, id }),

  updateLedger: (password: string, ledger_id: Id, payload: LedgerUpdatePayload) =>
    post<unknown>({ action: 'updateLedger', password, ledger_id, ...payload })
};
