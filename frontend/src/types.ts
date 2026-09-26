// 對應 sheet-template/README.md 的資料表結構
// Sheets 回傳的型別有時是字串，保守起見同時接受 string | number。

export type Id = string;
export type IsoDate = string;   // 'YYYY-MM-DD' or ISO timestamp
export type BoolLike = boolean | string;
export type NumLike = number | string;

// 目前帳本視圖中的玩家：name 取全域玩家，active 取這本帳的成員狀態
export interface Player {
  id: Id;
  name: string;
  active: BoolLike;
  created_at: IsoDate;
}

// Players 分頁：全部帳本共用
export interface GlobalPlayer {
  id: Id;
  name: string;
  created_at: IsoDate;
}

// Members__L* 分頁：玩家在某本帳的成員資格與停用狀態
export interface Member {
  player_id: Id;
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

export interface Ledger {
  id: Id;                   // 'L1'、'L2'…
  name: string;
  purpose: string;          // 用途的一個詞，例如「旅遊」，用來組畫面文字；可為空
  goal: NumLike;
  goal_name: string;
  tsumo_amount: number;     // 後端已套用預設值
  cut_ratio: number;        // 後端已套用預設值
  settle_weekday: number;   // 結算日，0 = 週日（同 dayjs().day()）
  created_at: IsoDate;
  members: Member[];
  rounds: Round[];
  tsumos: Tsumo[];
  withdrawals: Withdrawal[];
}

// getAll 回傳：全域資料加上所有帳本
export interface Snapshot {
  settings: { currency_symbol?: string };
  players: GlobalPlayer[];
  ledgers: Ledger[];
}

// 目前帳本的設定，加上全域的 currency_symbol
export interface SettingsMap {
  name: string;
  purpose: string;
  goal: NumLike;
  goal_name: string;
  tsumo_amount: number;
  cut_ratio: number;
  settle_weekday: number;
  currency_symbol: string;
}

// 元件看到的是目前帳本的資料視圖
export interface AppData {
  players: Player[];
  tsumos: Tsumo[];
  rounds: Round[];
  withdrawals: Withdrawal[];
  settings: SettingsMap;
}

export interface LedgerOption {
  id: Id;
  name: string;
}

// ===== Action payloads =====

export interface RoundEntry {
  player_id: Id;
  amount: number;
}

export interface RoundTsumoEntry {
  player_id: Id;
  count: number;
}

export interface RoundWithTsumosPayload {
  date: IsoDate;
  entries: RoundEntry[];           // 必須恰好 4 筆，玩家不重複，amount 總和 = 0
  tsumos: RoundTsumoEntry[];       // 0..4 筆，count > 0，player_id 必屬 entries
  note?: string;
}

export interface WithdrawalPayload {
  date: IsoDate;
  amount: number;
  note?: string;
}

export interface PlayerUpdatePayload {
  id: Id;
  name: string;
}

export interface LedgerUpdatePayload {
  name?: string;
  goal?: number;
  goal_name?: string;
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
  | 'addRound'
  | 'weeklySettlements'
  | 'players'
  | 'withdrawals'
  | 'settings'
  | 'more';
