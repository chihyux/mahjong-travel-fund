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

// 每局 4 位玩家各一列，以 round_id 關聯；amount 可正可負，同 round_id 總和 = 0
export interface Round {
  id: Id;
  round_id: Id;
  date: IsoDate;
  player_id: Id;
  amount: NumLike;
  cut_amount: NumLike;
  settled: BoolLike;
  settled_at?: IsoDate;
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
  rounds: Round[];
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

export interface RoundEntry {
  player_id: Id;
  amount: number;
}

export interface RoundPayload {
  date: IsoDate;
  entries: RoundEntry[]; // 必須恰好 4 筆，玩家不重複，amount 總和 = 0
  note?: string;
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
  | 'addRound'
  | 'weeklySettlements'
  | 'players'
  | 'withdrawals'
  | 'settings'
  | 'more';
