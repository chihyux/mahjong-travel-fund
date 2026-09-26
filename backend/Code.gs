/**
 * 家庭旅遊基金：Google Apps Script 後端 v5（多帳本）
 *
 * 規則：
 * - 可以有多本帳本（Ledgers 分頁一本一列），每本帳的局、自摸、支出、成員各自一組分頁
 * - 自摸：每筆 + 該帳本的 tsumo_amount 進公基金
 * - 每局結算：打完東南西北風，一次記 4 位玩家的輸贏（amount 可正可負，總和 = 0）；
 *             贏家 amount × 該帳本的 cut_ratio 進公基金
 * - 週結算：按週批次標記 settled（不影響金額，只是會計狀態）；每本帳的結算日可不同
 * - 玩家全部帳本共用，停用狀態各帳本分開記在 Members__L*
 *
 * 部署：
 * 1. 選單「擴充功能 → Apps Script」→ 貼入此檔
 * 2. 新安裝執行 initSheets()；從單一帳本版本升級則執行 migrateToLedgers()
 * 3. 部署 → 新增部署作業 → 網頁應用程式
 *    - 執行身分：我
 *    - 存取權：所有人
 * 4. 複製 Web App URL → 貼到前端 config.ts
 * 5. 之後要開新帳本：改 createLedger() 開頭的參數再執行
 */

const SHEET_PLAYERS = 'Players';
const SHEET_SETTINGS = 'Settings';
const SHEET_LEDGERS = 'Ledgers';

// 每本帳各自一組分頁，名稱為「原名__帳本代號」，例如 Rounds__L2
const BASE_ROUNDS = 'Rounds';
const BASE_TSUMOS = 'Tsumos';
const BASE_WITHDRAWALS = 'Withdrawals';
const BASE_MEMBERS = 'Members';

const HEADERS_PLAYERS = ['id', 'name', 'created_at'];
const HEADERS_LEDGERS = [
  'id', 'name', 'purpose', 'goal', 'goal_name',
  'tsumo_amount', 'cut_ratio', 'settle_weekday', 'created_at'
];
const HEADERS_ROUNDS = [
  'id', 'round_id', 'date', 'player_id', 'amount',
  'cut_amount', 'settled', 'settled_at', 'note', 'created_at'
];
const HEADERS_TSUMOS = ['id', 'date', 'player_id', 'count', 'amount', 'note', 'created_at'];
const HEADERS_WITHDRAWALS = ['id', 'date', 'amount', 'note', 'created_at'];
const HEADERS_MEMBERS = ['player_id', 'active', 'created_at'];

const LEDGER_SHEETS = [
  { base: BASE_ROUNDS, headers: HEADERS_ROUNDS },
  { base: BASE_TSUMOS, headers: HEADERS_TSUMOS },
  { base: BASE_WITHDRAWALS, headers: HEADERS_WITHDRAWALS },
  { base: BASE_MEMBERS, headers: HEADERS_MEMBERS }
];

// Sheet 上的結算日填中文；陣列 index 同 JavaScript Date.getDay()，0 = 週日。
// 前端 frontend/src/lib/utils.ts 有同一份 WEEKDAY_ZH，兩邊要一起改
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

// 預設規則（若帳本未設或不合法時的 fallback）
const DEFAULT_TSUMO_AMOUNT = 30;
const DEFAULT_CUT_RATIO = 0.10;

// ===== 帳本純函式（不碰 Spreadsheet，可在 Node 以 vm 載入驗證） =====
function ledgerSheetName(base, ledgerId) { return base + '__' + ledgerId; }

// 代號不是 L 加數字時排到最後
function ledgerNumber(ledgerId) {
  const m = /^L(\d+)$/.exec(String(ledgerId));
  return m ? Number(m[1]) : Infinity;
}

function nextLedgerId(ledgers) {
  let max = 0;
  ledgers.forEach(l => {
    const n = ledgerNumber(l.id);
    if (isFinite(n)) max = Math.max(max, n);
  });
  return 'L' + (max + 1);
}

// 空白或填錯一律當週日，等於多帳本之前固定週一到週日的分週
function parseSettleWeekday(v) {
  const i = WEEKDAY_ZH.indexOf(String(v === undefined || v === null ? '' : v).trim());
  return i >= 0 ? i : 0;
}

function ledgerTsumoAmount(ledger) {
  const v = Number(ledger.tsumo_amount);
  return isFinite(v) && v > 0 ? v : DEFAULT_TSUMO_AMOUNT;
}

function ledgerCutRatio(ledger) {
  const v = Number(ledger.cut_ratio);
  return isFinite(v) && v > 0 && v < 1 ? v : DEFAULT_CUT_RATIO;
}

// 玩家名稱與帳本名稱都要全域唯一；exceptId 用於改名時排除自己
function findNameConflict(rows, name, exceptId) {
  const target = String(name).trim();
  return rows.some(r =>
    String(r.name).trim() === target && String(r.id) !== String(exceptId || '')
  );
}

function validateNewLedger(ledgers, input) {
  const name = String(input.name || '').trim();
  if (!name) return '帳本名稱不可空白';
  if (findNameConflict(ledgers, name, '')) return '已有同名的帳本';
  if (WEEKDAY_ZH.indexOf(String(input.settle_weekday || '').trim()) < 0) {
    return 'settle_weekday 需為 一、二、三、四、五、六、日 其中一個字';
  }
  return '';
}

// ===== 工具 =====
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function okOut(data) { return jsonOut({ ok: true, data: data }); }
function errOut(msg, code) { return jsonOut({ ok: false, error: msg, code: code || 'ERROR' }); }

function newId(prefix) {
  const d = new Date();
  const stamp = Utilities.formatDate(d, 'Asia/Taipei', 'yyyyMMddHHmmss');
  const rand = Math.random().toString(36).slice(2, 6);
  return prefix + '_' + stamp + '_' + rand;
}

function nowIso() { return new Date().toISOString(); }

// 第一列是表頭，其餘每列轉成物件；全空的列略過。convert 處理個別儲存格
function rowsToObjects(values, convert) {
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null || c === undefined)) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const v = row[j];
      obj[headers[j]] = convert(v === undefined ? '' : v, headers[j]);
    }
    rows.push(obj);
  }
  return rows;
}

function readSheet(name) {
  const sheet = ss().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return rowsToObjects(sheet.getDataRange().getValues(), v => (v instanceof Date ? v.toISOString() : v));
}

// 會存成日期的欄位；Sheets API 回傳的日期是序列值，要轉成跟 readSheet 一樣的 ISO 字串
const DATE_COLUMNS = ['date', 'created_at', 'settled_at'];

// 序列值是試算表時區下的日期時間（以 1899-12-30 為第 0 天），先取出牆上時間再依時區換成實際時刻。
// Utilities 每次呼叫都慢，上千個日期格會花掉一秒以上；時區差同一小時內不變，按小時快取
function serialToIso(serial, tz, offsetByHour) {
  const wallMs = Math.round((serial - 25569) * 86400) * 1000;
  const hour = Math.floor(wallMs / 3600000);
  let offset = offsetByHour[hour];
  if (offset === undefined) {
    const hourStart = hour * 3600000;
    const text = Utilities.formatDate(new Date(hourStart), 'UTC', 'yyyy-MM-dd HH:mm:ss');
    offset = hourStart - Utilities.parseDate(text, tz, 'yyyy-MM-dd HH:mm:ss').getTime();
    offsetByHour[hour] = offset;
  }
  return new Date(wallMs - offset).toISOString();
}

// 每讀一個分頁是一次往返（約 0.3 秒）；用 Sheets 進階服務一次讀完。需在編輯器的「服務」加入 Google Sheets API
function batchReadSheets(names) {
  const spreadsheet = ss();
  const res = Sheets.Spreadsheets.Values.batchGet(spreadsheet.getId(), {
    ranges: names.map(n => "'" + n.replace(/'/g, "''") + "'"),
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER'
  });
  const tz = spreadsheet.getSpreadsheetTimeZone();
  const offsetByHour = {};
  const out = {};
  (res.valueRanges || []).forEach((vr, i) => {
    out[names[i]] = rowsToObjects(vr.values || [], (v, header) =>
      typeof v === 'number' && DATE_COLUMNS.indexOf(header) >= 0 ? serialToIso(v, tz, offsetByHour) : v
    );
  });
  return out;
}

// 進階服務沒啟用或超過用量時退回逐頁讀，最差只是變慢
function readSheets(names) {
  try {
    return batchReadSheets(names);
  } catch (err) {
    console.warn('batchReadSheets 失敗，改逐頁讀取：' + err.message);
    const out = {};
    names.forEach(n => { out[n] = readSheet(n); });
    return out;
  }
}

function appendRow(name, obj) {
  const sheet = ss().getSheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

function findRowIndexBy(name, key, value) {
  const sheet = ss().getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const col = values[0].indexOf(key);
  if (col < 0) throw new Error(key + ' column missing in ' + name);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col]) === String(value)) return i + 1;
  }
  return -1;
}

function findRowIndexById(name, id) { return findRowIndexBy(name, 'id', id); }

function updateRowBy(name, key, value, patch) {
  const sheet = ss().getSheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = findRowIndexBy(name, key, value);
  if (rowIndex < 0) throw new Error('Row not found: ' + value);
  for (const k in patch) {
    const col = headers.indexOf(k);
    if (col >= 0) sheet.getRange(rowIndex, col + 1).setValue(patch[k]);
  }
}

function updateRowById(name, id, patch) { updateRowBy(name, 'id', id, patch); }

function deleteRowById(name, id) {
  const sheet = ss().getSheetByName(name);
  const rowIndex = findRowIndexById(name, id);
  if (rowIndex < 0) throw new Error('Row not found: ' + id);
  sheet.deleteRow(rowIndex);
}

function ensureSheet(name, headers) {
  const spreadsheet = ss();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function createLedgerSheets(ledgerId) {
  LEDGER_SHEETS.forEach(s => ensureSheet(ledgerSheetName(s.base, ledgerId), s.headers));
}

function readSettings() {
  const rows = readSheet(SHEET_SETTINGS);
  const map = {};
  rows.forEach(r => { if (r.key) map[r.key] = r.value; });
  return map;
}

function readLedgers() { return readSheet(SHEET_LEDGERS); }

// 缺任何一個分頁的帳本（例如手動在 Ledgers 分頁加列）視為不存在，讀寫都略過
function ledgerSheetsPresent(ledgerId) {
  const id = String(ledgerId || '');
  if (!id) return false;
  const spreadsheet = ss();
  return LEDGER_SHEETS.every(s => spreadsheet.getSheetByName(ledgerSheetName(s.base, id)));
}

function getLedger(ledgerId) {
  const id = String(ledgerId || '');
  if (!ledgerSheetsPresent(id)) return null;
  return readLedgers().filter(l => String(l.id) === id)[0] || null;
}

function readMemberIds(ledgerId) {
  return new Set(readSheet(ledgerSheetName(BASE_MEMBERS, ledgerId)).map(m => String(m.player_id)));
}

function verifyAdmin(password) {
  const expected = String(readSettings().admin_password || '');
  return String(password || '') === expected && expected.length > 0;
}

// 把各種日期表示統一成 'YYYY-MM-DD'（Sheet 可能存成 Date 物件或字串）
function asDateStr(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  return String(v || '').slice(0, 10);
}

// 純字串日期運算：'YYYY-MM-DD' + N 天 → 'YYYY-MM-DD'。
// 避免 new Date('YYYY-MM-DDT00:00:00') 受 script timezone 影響造成差一天。
function addDaysStr(ymd, days) {
  const parts = String(ymd).split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return Utilities.formatDate(dt, 'UTC', 'yyyy-MM-dd');
}

// 'YYYY-MM-DD' 是星期幾（0 = 週日）；同 addDaysStr 用 UTC 避免 script timezone 影響
function weekdayOfDateStr(ymd) {
  const parts = String(ymd).split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))).getUTCDay();
}

// ===== 路由 =====
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'getAll';
    if (action === 'getAll') return handleGetAll();
    if (action === 'ping') return okOut({ t: nowIso() });
    return errOut('Unknown action: ' + action);
  } catch (err) {
    return errOut(err.message);
  }
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action;
    if (!action) return errOut('Missing action');

    if (action === 'login') return handleLogin(body);

    const writeActions = [
      'addPlayer', 'updatePlayer', 'addMembers', 'setMemberActive',
      'deleteTsumo',
      'addRoundWithTsumos', 'deleteRound', 'markWeekSettled',
      'addWithdrawal', 'deleteWithdrawal',
      'updateLedger'
    ];
    if (writeActions.indexOf(action) < 0) return errOut('Unknown action: ' + action);
    if (!verifyAdmin(body.password)) return errOut('Unauthorized', 'UNAUTHORIZED');

    // 玩家名稱、成員列的唯一性是先查再寫，兩台裝置同時寫入會兩邊都通過檢查
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (err) {
      return errOut('系統忙碌中，請稍後再試');
    }
    try {
      switch (action) {
        case 'addPlayer': return handleAddPlayer(body);
        case 'updatePlayer': return handleUpdatePlayer(body);
        case 'addMembers': return handleAddMembers(body);
        case 'setMemberActive': return handleSetMemberActive(body);
        case 'deleteTsumo': return handleDeleteTsumo(body);
        case 'addRoundWithTsumos': return handleAddRoundWithTsumos(body);
        case 'deleteRound': return handleDeleteRound(body);
        case 'markWeekSettled': return handleMarkWeekSettled(body);
        case 'addWithdrawal': return handleAddWithdrawal(body);
        case 'deleteWithdrawal': return handleDeleteWithdrawal(body);
        case 'updateLedger': return handleUpdateLedger(body);
        default: return errOut('Unknown action: ' + action);
      }
    } finally {
      // 放鎖前先把寫入提交，否則下一個拿到鎖的請求可能還讀不到這次寫的列
      SpreadsheetApp.flush();
      lock.releaseLock();
    }
  } catch (err) {
    return errOut(err.message);
  }
}

// ===== Handlers =====
function handleGetAll() {
  const sheetNames = new Set(ss().getSheets().map(sh => sh.getName()));
  const ledgerTabs = [...sheetNames].filter(n => LEDGER_SHEETS.some(s => n.indexOf(s.base + '__') === 0));
  const data = readSheets([SHEET_SETTINGS, SHEET_PLAYERS, SHEET_LEDGERS].concat(ledgerTabs));

  const settings = {};
  data[SHEET_SETTINGS].forEach(r => { if (r.key) settings[r.key] = r.value; });
  delete settings.admin_password;

  const rows = data[SHEET_LEDGERS];
  // 一本帳壞掉不拖垮其他帳本；但全部都壞時要報錯，否則畫面看起來像資料被清空
  const valid = rows.filter(l => {
    const id = String(l.id || '');
    return id !== '' && LEDGER_SHEETS.every(s => sheetNames.has(ledgerSheetName(s.base, id)));
  });
  if (rows.length > 0 && valid.length === 0) {
    throw new Error('帳本分頁不完整：' + rows.map(l => String(l.id)).join(', '));
  }
  const ledgers = valid
    .map(l => {
      const id = String(l.id);
      return {
        id: id,
        name: String(l.name || ''),
        purpose: String(l.purpose || ''),
        goal: l.goal,
        goal_name: String(l.goal_name || ''),
        tsumo_amount: ledgerTsumoAmount(l),
        cut_ratio: ledgerCutRatio(l),
        settle_weekday: parseSettleWeekday(l.settle_weekday),
        created_at: l.created_at,
        members: data[ledgerSheetName(BASE_MEMBERS, id)],
        rounds: data[ledgerSheetName(BASE_ROUNDS, id)],
        tsumos: data[ledgerSheetName(BASE_TSUMOS, id)],
        withdrawals: data[ledgerSheetName(BASE_WITHDRAWALS, id)]
      };
    })
    .sort((a, b) => ledgerNumber(a.id) - ledgerNumber(b.id));
  return okOut({ settings: settings, players: data[SHEET_PLAYERS], ledgers: ledgers });
}

function handleLogin(body) {
  if (verifyAdmin(body.password)) return okOut({ authenticated: true });
  return errOut('密碼錯誤', 'INVALID_PASSWORD');
}

// ---- 玩家與成員 ----
function handleAddPlayer(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  const name = String(body.name || '').trim();
  if (!name) return errOut('名字不可空白');
  const sameName = readSheet(SHEET_PLAYERS).filter(p => findNameConflict([p], name, ''))[0];
  if (sameName) {
    return errOut(readMemberIds(ledger.id).has(String(sameName.id))
      ? '這本帳已有這位玩家'
      : '已有這位玩家，請改用拉入');
  }
  const now = nowIso();
  const player = { id: newId('p'), name: name, created_at: now };
  appendRow(SHEET_PLAYERS, player);
  appendRow(ledgerSheetName(BASE_MEMBERS, ledger.id), {
    player_id: player.id,
    active: true,
    created_at: now
  });
  return okOut(player);
}

// 改名全域生效，所有帳本一起變
function handleUpdatePlayer(body) {
  if (!body.id) return errOut('Missing id');
  const name = String(body.name || '').trim();
  if (!name) return errOut('名字不可空白');
  if (findNameConflict(readSheet(SHEET_PLAYERS), name, body.id)) return errOut('已有同名的玩家');
  updateRowById(SHEET_PLAYERS, body.id, { name: name });
  return okOut({ id: body.id });
}

// 整批驗證通過才寫入，避免拉到一半
function handleAddMembers(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  const ids = Array.isArray(body.player_ids) ? body.player_ids.map(String) : [];
  if (ids.length === 0) return errOut('請選擇玩家');
  if (new Set(ids).size !== ids.length) return errOut('玩家不可重複');

  const playerIds = new Set(readSheet(SHEET_PLAYERS).map(p => String(p.id)));
  const memberIds = readMemberIds(ledger.id);
  for (const id of ids) {
    if (!playerIds.has(id)) return errOut('玩家不存在');
    if (memberIds.has(id)) return errOut('玩家已在這本帳');
  }

  const sheetName = ledgerSheetName(BASE_MEMBERS, ledger.id);
  const now = nowIso();
  ids.forEach(id => appendRow(sheetName, { player_id: id, active: true, created_at: now }));
  return okOut({ added: ids.length });
}

function handleSetMemberActive(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.player_id) return errOut('Missing player');
  const sheetName = ledgerSheetName(BASE_MEMBERS, ledger.id);
  if (findRowIndexBy(sheetName, 'player_id', body.player_id) < 0) return errOut('玩家不在這本帳');
  const active = !!body.active;
  updateRowBy(sheetName, 'player_id', body.player_id, { active: active });
  return okOut({ player_id: body.player_id, active: active });
}

// ---- 自摸 ----
function handleDeleteTsumo(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.id) return errOut('Missing id');
  deleteRowById(ledgerSheetName(BASE_TSUMOS, ledger.id), body.id);
  return okOut({ id: body.id });
}

// ---- 每局結算 + 自摸（合併入口） ----
function handleAddRoundWithTsumos(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.date) return errOut('Missing date');
  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length !== 4) {
    return errOut('需要 4 位玩家');
  }

  const playerIds = entries.map(e => String((e && e.player_id) || ''));
  if (playerIds.some(id => !id)) return errOut('玩家未選齊');
  if (new Set(playerIds).size !== 4) return errOut('玩家不可重複');
  const memberIds = readMemberIds(ledger.id);
  if (playerIds.some(id => !memberIds.has(id))) return errOut('玩家不在這本帳');

  let sum = 0;
  const normalizedEntries = entries.map(e => {
    const amt = Number(e.amount);
    if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
      throw new Error('amount 需為整數');
    }
    sum += amt;
    return { player_id: String(e.player_id), amount: amt };
  });
  if (sum !== 0) return errOut('輸贏總和需為 0');
  if (normalizedEntries.every(e => e.amount === 0)) return errOut('金額全為 0');

  const tsumosInput = Array.isArray(body.tsumos) ? body.tsumos : [];
  const playerIdSet = new Set(playerIds);
  const seenTsumoPids = new Set();
  const normalizedTsumos = tsumosInput.map(t => {
    if (!t || typeof t !== 'object') throw new Error('tsumo 格式錯誤');
    const pid = String(t.player_id || '');
    if (!pid) throw new Error('tsumo player_id 不可空白');
    if (!playerIdSet.has(pid)) throw new Error('tsumo player 必須是本局玩家');
    if (seenTsumoPids.has(pid)) throw new Error('tsumo player 不可重複');
    seenTsumoPids.add(pid);
    const count = Number(t.count);
    if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
      throw new Error('tsumo count 需為正整數');
    }
    return { player_id: pid, count: count };
  });

  const roundId = newId('rnd');
  const date = String(body.date);
  const note = String(body.note || '');
  const now = nowIso();
  const cutRatio = ledgerCutRatio(ledger);
  const tsumoUnit = ledgerTsumoAmount(ledger);
  const roundsSheet = ledgerSheetName(BASE_ROUNDS, ledger.id);
  const tsumosSheet = ledgerSheetName(BASE_TSUMOS, ledger.id);

  normalizedEntries.forEach(e => {
    const cut = e.amount > 0 ? Math.round(e.amount * cutRatio) : 0;
    appendRow(roundsSheet, {
      id: newId('r'),
      round_id: roundId,
      date: date,
      player_id: e.player_id,
      amount: e.amount,
      cut_amount: cut,
      settled: false,
      settled_at: '',
      note: note,
      created_at: now
    });
  });

  const tsumoIds = [];
  normalizedTsumos.forEach(t => {
    const tid = newId('t');
    appendRow(tsumosSheet, {
      id: tid,
      date: date,
      player_id: t.player_id,
      count: t.count,
      amount: tsumoUnit * t.count,
      note: '',
      created_at: now
    });
    tsumoIds.push(tid);
  });

  return okOut({ round_id: roundId, tsumo_ids: tsumoIds });
}

function handleDeleteRound(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.round_id) return errOut('Missing round_id');
  const sheetName = ledgerSheetName(BASE_ROUNDS, ledger.id);
  const sheet = ss().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = headers.indexOf('round_id');
  if (col < 0) throw new Error('round_id column missing in ' + sheetName);

  // 從下往上刪，避免 index 位移
  let deleted = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][col]) === String(body.round_id)) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  if (deleted === 0) return errOut('Round not found');
  return okOut({ round_id: body.round_id, deleted: deleted });
}

function handleMarkWeekSettled(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.week_start) return errOut('Missing week_start');
  const weekStart = String(body.week_start); // 'YYYY-MM-DD'，前端依該帳本的結算日算出週期第一天
  const settled = !!body.settled;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return errOut('week_start 格式錯誤');
  // 頁面開著時有人改了結算日，舊頁面送來的起始日會標到橫跨兩個新週期的 7 天
  if (weekdayOfDateStr(weekStart) !== (parseSettleWeekday(ledger.settle_weekday) + 1) % 7) {
    return errOut('週期起始日與帳本結算日不符，請重新整理');
  }
  const endStr = addDaysStr(weekStart, 7);

  const sheet = ss().getSheetByName(ledgerSheetName(BASE_ROUNDS, ledger.id));
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return okOut({ changed: 0 });

  const headers = values[0];
  const dateCol = headers.indexOf('date');
  const settledCol = headers.indexOf('settled');
  const settledAtCol = headers.indexOf('settled_at');
  if (dateCol < 0 || settledCol < 0 || settledAtCol < 0) {
    throw new Error('Rounds sheet schema incomplete');
  }

  const now = nowIso();
  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const d = asDateStr(values[i][dateCol]);
    if (!d) continue;
    if (d >= weekStart && d < endStr) {
      values[i][settledCol] = settled;
      values[i][settledAtCol] = settled ? now : '';
      changed++;
    }
  }
  if (changed > 0) range.setValues(values);
  return okOut({ week_start: weekStart, settled: settled, changed: changed });
}

// ---- 提領 ----
function handleAddWithdrawal(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.date) return errOut('Missing date');
  if (body.amount === undefined || body.amount === null) return errOut('Missing amount');
  const amount = Number(body.amount);
  if (!isFinite(amount) || amount <= 0) return errOut('金額不正確');
  const w = {
    id: newId('w'),
    date: String(body.date),
    amount: amount,
    note: String(body.note || ''),
    created_at: nowIso()
  };
  appendRow(ledgerSheetName(BASE_WITHDRAWALS, ledger.id), w);
  return okOut(w);
}

function handleDeleteWithdrawal(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  if (!body.id) return errOut('Missing id');
  deleteRowById(ledgerSheetName(BASE_WITHDRAWALS, ledger.id), body.id);
  return okOut({ id: body.id });
}

// ---- 帳本設定 ----
// App 只能改名稱與目標；tsumo_amount、cut_ratio、purpose、settle_weekday 只能直接改 Ledgers 分頁
function handleUpdateLedger(body) {
  const ledger = getLedger(body.ledger_id);
  if (!ledger) return errOut('帳本不存在');
  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return errOut('帳本名稱不可空白');
    if (findNameConflict(readLedgers(), name, ledger.id)) return errOut('已有同名的帳本');
    patch.name = name;
  }
  if (body.goal !== undefined) patch.goal = Number(body.goal) || 0;
  if (body.goal_name !== undefined) patch.goal_name = String(body.goal_name);
  if (Object.keys(patch).length === 0) return errOut('Nothing to update');
  updateRowById(SHEET_LEDGERS, ledger.id, patch);
  return okOut({ id: ledger.id });
}

// ===== 建立帳本（在 Apps Script 編輯器執行） =====
// 改好下面 input 的值，再選 createLedger 按「執行」。settle_weekday 是結算日，填 一 到 日 其中一個字。
function createLedger() {
  const input = {
    name: '聚餐基金',
    purpose: '聚餐',
    tsumo_amount: 30,
    cut_ratio: 0.1,
    settle_weekday: '日'
  };

  const ui = SpreadsheetApp.getUi();
  const ledgers = readLedgers();
  const error = validateNewLedger(ledgers, input);
  if (error) {
    ui.alert(error);
    return;
  }

  // 先建分頁再寫 Ledgers：中途失敗時 getAll 不會讀到缺分頁的帳本
  const id = nextLedgerId(ledgers);
  createLedgerSheets(id);
  appendRow(SHEET_LEDGERS, {
    id: id,
    name: String(input.name).trim(),
    purpose: String(input.purpose || '').trim(),
    goal: 0,
    goal_name: '',
    tsumo_amount: input.tsumo_amount,
    cut_ratio: input.cut_ratio,
    settle_weekday: String(input.settle_weekday).trim(),
    created_at: nowIso()
  });
  ui.alert('已建立帳本 ' + id + '：' + String(input.name).trim());
}

// ===== 從單一帳本版本升級（一次性） =====
// 執行前先用「檔案 → 建立副本」備份；Apps Script 沒有交易，中途失敗要用版本紀錄還原
function migrateToLedgers() {
  const spreadsheet = ss();
  const ui = SpreadsheetApp.getUi();
  if (spreadsheet.getSheetByName(SHEET_LEDGERS)) {
    ui.alert('已經 migrate 過，不再執行。');
    return;
  }
  const oldSheets = [BASE_ROUNDS, BASE_TSUMOS, BASE_WITHDRAWALS, SHEET_PLAYERS, SHEET_SETTINGS];
  const missing = oldSheets.filter(name => !spreadsheet.getSheetByName(name));
  if (missing.length > 0) {
    ui.alert('找不到分頁：' + missing.join(', ') + '，已中止。');
    return;
  }

  const old = readSettings();
  const players = readSheet(SHEET_PLAYERS);

  [BASE_ROUNDS, BASE_TSUMOS, BASE_WITHDRAWALS].forEach(base => {
    spreadsheet.getSheetByName(base).setName(ledgerSheetName(base, 'L1'));
  });

  const membersSheet = ensureSheet(ledgerSheetName(BASE_MEMBERS, 'L1'), HEADERS_MEMBERS);
  if (players.length > 0) {
    membersSheet
      .getRange(2, 1, players.length, HEADERS_MEMBERS.length)
      .setValues(players.map(p => [p.id, p.active, p.created_at]));
  }

  const playersSheet = spreadsheet.getSheetByName(SHEET_PLAYERS);
  const playerHeaders = playersSheet.getRange(1, 1, 1, playersSheet.getLastColumn()).getValues()[0];
  const activeCol = playerHeaders.indexOf('active');
  if (activeCol >= 0) playersSheet.deleteColumn(activeCol + 1);

  ensureSheet(SHEET_LEDGERS, HEADERS_LEDGERS);
  appendRow(SHEET_LEDGERS, {
    id: 'L1',
    name: old.group_name || '家庭旅遊基金',
    purpose: '旅遊',
    goal: old.goal,
    goal_name: old.goal_name,
    tsumo_amount: old.tsumo_amount,
    cut_ratio: old.cut_ratio,
    settle_weekday: '日',
    created_at: nowIso()
  });

  const movedKeys = ['group_name', 'goal', 'goal_name', 'tsumo_amount', 'cut_ratio'];
  const settingsSheet = spreadsheet.getSheetByName(SHEET_SETTINGS);
  const settingValues = settingsSheet.getDataRange().getValues();
  for (let i = settingValues.length - 1; i >= 1; i--) {
    if (movedKeys.indexOf(String(settingValues[i][0])) >= 0) settingsSheet.deleteRow(i + 1);
  }

  ui.alert('Migration 完成：原本的資料已成為帳本 L1。');
}

// ===== 一鍵初始化（新安裝） =====
function initSheets() {
  const spreadsheet = ss();
  const ui = SpreadsheetApp.getUi();
  if (spreadsheet.getSheetByName(BASE_ROUNDS) && !spreadsheet.getSheetByName(SHEET_LEDGERS)) {
    ui.alert('偵測到舊的分頁結構，請改跑 migrateToLedgers()。');
    return;
  }

  ensureSheet(SHEET_PLAYERS, HEADERS_PLAYERS);
  const settingsSheet = ensureSheet(SHEET_SETTINGS, ['key', 'value']);
  const defaults = {
    admin_password: '1234',
    currency_symbol: '$'
  };
  const existing = readSettings();
  for (const k in defaults) {
    if (existing[k] === undefined) {
      settingsSheet.appendRow([k, defaults[k]]);
    }
  }

  createLedgerSheets('L1');
  ensureSheet(SHEET_LEDGERS, HEADERS_LEDGERS);
  if (!getLedger('L1')) {
    appendRow(SHEET_LEDGERS, {
      id: 'L1',
      name: '家庭旅遊基金',
      purpose: '旅遊',
      goal: 10000,
      goal_name: '下一次旅遊 2027.04',
      tsumo_amount: DEFAULT_TSUMO_AMOUNT,
      cut_ratio: DEFAULT_CUT_RATIO,
      settle_weekday: '日',
      created_at: nowIso()
    });
  }

  ui.alert('初始化完成！請到 Settings 分頁修改預設密碼 (admin_password)。');
}
