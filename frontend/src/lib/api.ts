import { API_URL } from '../config';
import type {
  ApiResponse,
  AppData,
  Id,
  PlayerUpdatePayload,
  RoundPayload,
  SettingsMap,
  TsumoPayload,
  TsumoUpdatePayload,
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

export const api = {
  getAll: () => get<AppData>({ action: 'getAll' }),
  login: (password: string) => post<unknown>({ action: 'login', password }),

  addPlayer: (password: string, name: string) =>
    post<unknown>({ action: 'addPlayer', password, name }),
  updatePlayer: (password: string, payload: PlayerUpdatePayload) =>
    post<unknown>({ action: 'updatePlayer', password, ...payload }),
  deletePlayer: (password: string, id: Id) =>
    post<unknown>({ action: 'deletePlayer', password, id }),

  addTsumo: (password: string, payload: TsumoPayload) =>
    post<unknown>({ action: 'addTsumo', password, ...payload }),
  updateTsumo: (password: string, payload: TsumoUpdatePayload) =>
    post<unknown>({ action: 'updateTsumo', password, ...payload }),
  deleteTsumo: (password: string, id: Id) =>
    post<unknown>({ action: 'deleteTsumo', password, id }),

  addRound: (password: string, payload: RoundPayload) =>
    post<unknown>({ action: 'addRound', password, ...payload }),
  deleteRound: (password: string, round_id: Id) =>
    post<unknown>({ action: 'deleteRound', password, round_id }),
  markWeekSettled: (password: string, week_start: string, settled: boolean) =>
    post<unknown>({ action: 'markWeekSettled', password, week_start, settled }),

  addWithdrawal: (password: string, payload: WithdrawalPayload) =>
    post<unknown>({ action: 'addWithdrawal', password, ...payload }),
  deleteWithdrawal: (password: string, id: Id) =>
    post<unknown>({ action: 'deleteWithdrawal', password, id }),

  updateSettings: (password: string, settings: Partial<SettingsMap>) =>
    post<unknown>({ action: 'updateSettings', password, settings })
};
