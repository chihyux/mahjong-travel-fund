// 對應 sheet-template/README.md 的資料表結構
// Sheets 回傳的型別有時是字串，保守起見同時接受 string | number。

export type Id = string;
export type IsoDate = string;   // 'YYYY-MM-DD' or ISO timestamp
export type BoolLike = boolean | string;
export type NumLike = number | string;

export interface Player {
  id: Id;
  name: string;
  active: BoolLike;
  created_at: IsoDate;
}

export interface Tsumo {
  id: Id;
  date: IsoDate;
  player_id: Id;
  count: NumLike;
  amount: NumLike;
  note?: string;
  created_at: IsoDate;
}

export interface Settlement {
  id: Id;
  date: IsoDate;
  player_id: Id;
  win_amount?: NumLike;
  cut_amount: NumLike;
  note?: string;
  created_at: IsoDate;
}

export interface Withdrawal {
  id: Id;
  date: IsoDate;
  amount: NumLike;
  note?: string;
  created_at: IsoDate;
}

export interface SettingsMap {
  admin_password?: string;
  tsumo_amount?: NumLike;
  cut_ratio?: NumLike;
  goal?: NumLike;
  goal_name?: string;
  group_name?: string;
  currency_symbol?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface AppData {
  players: Player[];
  tsumos: Tsumo[];
  settlements: Settlement[];
  withdrawals: Withdrawal[];
  settings: SettingsMap;
}

// ===== Action payloads =====

export interface TsumoPayload {
  date: IsoDate;
  player_id: Id;
  count: number;
  note?: string;
}

export interface TsumoUpdatePayload extends Partial<TsumoPayload> {
  id: Id;
}

export interface SettlementPayload {
  date: IsoDate;
  player_id: Id;
  win_amount?: number;
  cut_amount: number;
  note?: string;
}

export interface SettlementUpdatePayload extends Partial<SettlementPayload> {
  id: Id;
}

export interface WithdrawalPayload {
  date: IsoDate;
  amount: number;
  note?: string;
}

export interface PlayerUpdatePayload {
  id: Id;
  name?: string;
  active?: boolean;
}

// ===== API envelope =====

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error?: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// ===== UI state =====

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  msg: string;
  type: ToastType;
  ts: number;
}

export type ViewKey =
  | 'dashboard'
  | 'history'
  | 'login'
  | 'addTsumo'
  | 'addSettlement'
  | 'players'
  | 'withdrawals'
  | 'settings'
  | 'more';
