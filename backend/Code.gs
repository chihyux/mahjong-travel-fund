/**
 * 家庭旅遊基金 — Google Apps Script 後端 v4
 *
 * 規則：
 * - 自摸：每局記一筆，每筆 +30 元進公基金
 * - 每局結算：打完東南西北風，一次記 4 位玩家的輸贏（amount 可正可負，總和 = 0）；
 *             贏家 amount × 10% 進公基金
 * - 週結算：按週批次標記 settled（不影響金額，只是會計狀態）
 *
 * 部署：
 * 1. 選單「擴充功能 → Apps Script」→ 貼入此檔
 * 2. 先執行 initSheets() 建立所有分頁與預設值（授權後）
 * 3. 部署 → 新增部署作業 → 網頁應用程式
 *    - 執行身分：我
 *    - 存取權：所有人
 * 4. 複製 Web App URL → 貼到前端 config.ts
 */

const SHEET_PLAYERS = 'Players';
const SHEET_TSUMOS = 'Tsumos';
const SHEET_ROUNDS = 'Rounds';
const SHEET_WITHDRAWALS = 'Withdrawals';
const SHEET_SETTINGS = 'Settings';

// 預設規則（若 Settings 未設或不合法時的 fallback）
const DEFAULT_TSUMO_AMOUNT = 30;
const DEFAULT_CUT_RATIO = 0.10;

function currentTsumoAmount() {
  const v = Number(readSettings().tsumo_amount);
  return isFinite(v) && v > 0 ? v : DEFAULT_TSUMO_AMOUNT;
}

function currentCutRatio() {
  const v = Number(readSettings().cut_ratio);
  return isFinite(v) && v > 0 && v < 1 ? v : DEFAULT_CUT_RATIO;
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

function readSheet(name) {
  const sheet = ss().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let v = row[j];
      if (v instanceof Date) v = v.toISOString();
      obj[headers[j]] = v;
    }
    rows.push(obj);
  }
  return rows;
}

function appendRow(name, obj) {
  const sheet = ss().getSheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

function findRowIndexById(name, id) {
  const sheet = ss().getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('id');
  if (idCol < 0) throw new Error('id column missing in ' + name);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) return i + 1;
  }
  return -1;
}

function updateRowById(name, id, patch) {
  const sheet = ss().getSheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = findRowIndexById(name, id);
  if (rowIndex < 0) throw new Error('Row not found: ' + id);
  for (const key in patch) {
    const col = headers.indexOf(key);
    if (col >= 0) sheet.getRange(rowIndex, col + 1).setValue(patch[key]);
  }
}

function deleteRowById(name, id) {
  const sheet = ss().getSheetByName(name);
  const rowIndex = findRowIndexById(name, id);
  if (rowIndex < 0) throw new Error('Row not found: ' + id);
  sheet.deleteRow(rowIndex);
}

function readSettings() {
  const rows = readSheet(SHEET_SETTINGS);
  const map = {};
  rows.forEach(r => { if (r.key) map[r.key] = r.value; });
  return map;
}

function setSetting(key, value) {
  const sheet = ss().getSheetByName(SHEET_SETTINGS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
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
      'addPlayer', 'updatePlayer', 'deletePlayer',
      'addTsumo', 'updateTsumo', 'deleteTsumo',
      'addRound', 'updateRound', 'deleteRound', 'markWeekSettled',
      'addWithdrawal', 'deleteWithdrawal',
      'updateSettings'
    ];
    if (writeActions.indexOf(action) >= 0 && !verifyAdmin(body.password)) {
      return errOut('Unauthorized', 'UNAUTHORIZED');
    }

    switch (action) {
      case 'addPlayer': return handleAddPlayer(body);
      case 'updatePlayer': return handleUpdatePlayer(body);
      case 'deletePlayer': return handleDeletePlayer(body);
      case 'addTsumo': return handleAddTsumo(body);
      case 'updateTsumo': return handleUpdateTsumo(body);
      case 'deleteTsumo': return handleDeleteTsumo(body);
      case 'addRound': return handleAddRound(body);
      case 'updateRound': return handleUpdateRound(body);
      case 'deleteRound': return handleDeleteRound(body);
      case 'markWeekSettled': return handleMarkWeekSettled(body);
      case 'addWithdrawal': return handleAddWithdrawal(body);
      case 'deleteWithdrawal': return handleDeleteWithdrawal(body);
      case 'updateSettings': return handleUpdateSettings(body);
      default: return errOut('Unknown action: ' + action);
    }
  } catch (err) {
    return errOut(err.message);
  }
}

// ===== Handlers =====
function handleGetAll() {
  const players = readSheet(SHEET_PLAYERS);
  const tsumos = readSheet(SHEET_TSUMOS);
  const rounds = readSheet(SHEET_ROUNDS);
  const withdrawals = readSheet(SHEET_WITHDRAWALS);
  const settings = readSettings();
  delete settings.admin_password;
  return okOut({ players, tsumos, rounds, withdrawals, settings });
}

function handleLogin(body) {
  if (verifyAdmin(body.password)) return okOut({ authenticated: true });
  return errOut('密碼錯誤', 'INVALID_PASSWORD');
}

function handleAddPlayer(body) {
  if (!body.name || String(body.name).trim() === '') return errOut('名字不可空白');
  const player = {
    id: newId('p'),
    name: String(body.name).trim(),
    active: true,
    created_at: nowIso()
  };
  appendRow(SHEET_PLAYERS, player);
  return okOut(player);
}

function handleUpdatePlayer(body) {
  if (!body.id) return errOut('Missing id');
  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.active !== undefined) patch.active = !!body.active;
  updateRowById(SHEET_PLAYERS, body.id, patch);
  return okOut({ id: body.id });
}

function handleDeletePlayer(body) {
  if (!body.id) return errOut('Missing id');
  deleteRowById(SHEET_PLAYERS, body.id);
  return okOut({ id: body.id });
}

// ---- 自摸 ----
function handleAddTsumo(body) {
  if (!body.date) return errOut('Missing date');
  if (!body.player_id) return errOut('Missing player');
  const count = Math.max(1, Number(body.count) || 1);
  const unit = currentTsumoAmount();
  const tsumo = {
    id: newId('t'),
    date: String(body.date),
    player_id: String(body.player_id),
    count: count,
    amount: unit * count,
    note: String(body.note || ''),
    created_at: nowIso()
  };
  appendRow(SHEET_TSUMOS, tsumo);
  return okOut(tsumo);
}

function handleUpdateTsumo(body) {
  if (!body.id) return errOut('Missing id');
  const patch = {};
  if (body.date !== undefined) patch.date = String(body.date);
  if (body.player_id !== undefined) patch.player_id = String(body.player_id);
  if (body.count !== undefined) {
    const count = Math.max(1, Number(body.count) || 1);
    patch.count = count;
    patch.amount = currentTsumoAmount() * count;
  }
  if (body.note !== undefined) patch.note = String(body.note);
  updateRowById(SHEET_TSUMOS, body.id, patch);
  return okOut({ id: body.id });
}

function handleDeleteTsumo(body) {
  if (!body.id) return errOut('Missing id');
  deleteRowById(SHEET_TSUMOS, body.id);
  return okOut({ id: body.id });
}

// ---- 每局結算（Rounds） ----
function handleAddRound(body) {
  if (!body.date) return errOut('Missing date');
  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length !== 4) {
    return errOut('需要 4 位玩家');
  }

  const ids = entries.map(e => String((e && e.player_id) || ''));
  if (ids.some(id => !id)) return errOut('玩家未選齊');
  if (new Set(ids).size !== 4) return errOut('玩家不可重複');

  // 驗證 amount 為整數、總和 = 0
  let sum = 0;
  const normalized = entries.map(e => {
    const amt = Number(e.amount);
    if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
      throw new Error('amount 需為整數');
    }
    sum += amt;
    return { player_id: String(e.player_id), amount: amt };
  });
  if (sum !== 0) return errOut('輸贏總和需為 0');
  if (normalized.every(e => e.amount === 0)) return errOut('金額全為 0');

  const roundId = newId('rnd');
  const date = String(body.date);
  const note = String(body.note || '');
  const now = nowIso();
  const cutRatio = currentCutRatio();

  normalized.forEach(e => {
    const cut = e.amount > 0 ? Math.round(e.amount * cutRatio) : 0;
    appendRow(SHEET_ROUNDS, {
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

  return okOut({ round_id: roundId });
}

// 更新一局。支援：
//   1) 只改 date / note：對該 round_id 的 4 列做欄位 in-place 修改
//   2) 提供 entries（4 筆、sum=0、不重複）：整組替換（保留原 round_id / settled / settled_at / created_at）
function handleUpdateRound(body) {
  if (!body.round_id) return errOut('Missing round_id');
  const sheet = ss().getSheetByName(SHEET_ROUNDS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const roundIdCol = headers.indexOf('round_id');
  if (roundIdCol < 0) throw new Error('round_id column missing in ' + SHEET_ROUNDS);
  const dateCol = headers.indexOf('date');
  const noteCol = headers.indexOf('note');
  const settledCol = headers.indexOf('settled');
  const settledAtCol = headers.indexOf('settled_at');
  const createdAtCol = headers.indexOf('created_at');

  // 收集現有列（sheet 1-based row index）與第一列作為 metadata 來源
  const existingSheetRows = [];
  let firstRow = null;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][roundIdCol]) === String(body.round_id)) {
      existingSheetRows.push(i + 1);
      if (firstRow === null) firstRow = values[i];
    }
  }
  if (existingSheetRows.length === 0) return errOut('Round not found');

  // Case 1：替換 entries
  if (body.entries !== undefined) {
    const entries = body.entries;
    if (!Array.isArray(entries) || entries.length !== 4) return errOut('需要 4 位玩家');
    const ids = entries.map(e => String((e && e.player_id) || ''));
    if (ids.some(id => !id)) return errOut('玩家未選齊');
    if (new Set(ids).size !== 4) return errOut('玩家不可重複');

    let sum = 0;
    const normalized = entries.map(e => {
      const amt = Number(e.amount);
      if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
        throw new Error('amount 需為整數');
      }
      sum += amt;
      return { player_id: String(e.player_id), amount: amt };
    });
    if (sum !== 0) return errOut('輸贏總和需為 0');
    if (normalized.every(e => e.amount === 0)) return errOut('金額全為 0');

    const date = body.date !== undefined ? String(body.date) : asDateStr(firstRow[dateCol]);
    const note = body.note !== undefined ? String(body.note) : String(firstRow[noteCol] || '');
    const settled = firstRow[settledCol];
    const settledAt = firstRow[settledAtCol];
    const createdAt = firstRow[createdAtCol] || nowIso();
    const cutRatio = currentCutRatio();

    // 從下往上刪舊列，再 append 新列
    for (let i = existingSheetRows.length - 1; i >= 0; i--) {
      sheet.deleteRow(existingSheetRows[i]);
    }
    normalized.forEach(e => {
      const cut = e.amount > 0 ? Math.round(e.amount * cutRatio) : 0;
      appendRow(SHEET_ROUNDS, {
        id: newId('r'),
        round_id: body.round_id,
        date: date,
        player_id: e.player_id,
        amount: e.amount,
        cut_amount: cut,
        settled: settled,
        settled_at: settledAt,
        note: note,
        created_at: createdAt
      });
    });
    return okOut({ round_id: body.round_id, replaced: 4 });
  }

  // Case 2：只改 date / note
  const newDate = body.date !== undefined ? String(body.date) : null;
  const newNote = body.note !== undefined ? String(body.note) : null;
  if (newDate === null && newNote === null) return errOut('Nothing to update');

  existingSheetRows.forEach(rowIndex => {
    if (newDate !== null && dateCol >= 0) sheet.getRange(rowIndex, dateCol + 1).setValue(newDate);
    if (newNote !== null && noteCol >= 0) sheet.getRange(rowIndex, noteCol + 1).setValue(newNote);
  });
  return okOut({ round_id: body.round_id, updated: existingSheetRows.length });
}

function handleDeleteRound(body) {
  if (!body.round_id) return errOut('Missing round_id');
  const sheet = ss().getSheetByName(SHEET_ROUNDS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = headers.indexOf('round_id');
  if (col < 0) throw new Error('round_id column missing in ' + SHEET_ROUNDS);

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
  if (!body.week_start) return errOut('Missing week_start');
  const weekStart = String(body.week_start); // 'YYYY-MM-DD'，前端保證是週一
  const settled = !!body.settled;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return errOut('week_start 格式錯誤');
  const endStr = addDaysStr(weekStart, 7);

  const sheet = ss().getSheetByName(SHEET_ROUNDS);
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
  appendRow(SHEET_WITHDRAWALS, w);
  return okOut(w);
}

function handleDeleteWithdrawal(body) {
  if (!body.id) return errOut('Missing id');
  deleteRowById(SHEET_WITHDRAWALS, body.id);
  return okOut({ id: body.id });
}

function handleUpdateSettings(body) {
  if (!body.settings || typeof body.settings !== 'object') return errOut('Missing settings');
  if (body.settings.admin_password !== undefined) {
    const newPw = String(body.settings.admin_password).trim();
    if (newPw.length < 4) return errOut('密碼至少 4 個字元');
    setSetting('admin_password', newPw);
    delete body.settings.admin_password;
  }
  for (const key in body.settings) {
    setSetting(key, body.settings[key]);
  }
  return okOut({ updated: true });
}

// ===== 一鍵初始化 =====
function initSheets() {
  const spreadsheet = ss();

  const ensure = (name, headers) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  };

  ensure(SHEET_PLAYERS, ['id', 'name', 'active', 'created_at']);
  ensure(SHEET_TSUMOS, ['id', 'date', 'player_id', 'count', 'amount', 'note', 'created_at']);
  ensure(SHEET_ROUNDS, [
    'id', 'round_id', 'date', 'player_id', 'amount',
    'cut_amount', 'settled', 'settled_at', 'note', 'created_at'
  ]);
  ensure(SHEET_WITHDRAWALS, ['id', 'date', 'amount', 'note', 'created_at']);
  const settingsSheet = ensure(SHEET_SETTINGS, ['key', 'value']);

  const defaults = {
    admin_password: '1234',
    tsumo_amount: 30,
    cut_ratio: 0.1,
    goal: 10000,
    goal_name: '下一次旅遊 2027.04',
    group_name: '家庭旅遊基金',
    currency_symbol: '$'
  };
  const existing = readSettings();
  for (const k in defaults) {
    if (existing[k] === undefined) {
      settingsSheet.appendRow([k, defaults[k]]);
    }
  }

  SpreadsheetApp.getUi().alert('初始化完成！請到 Settings 分頁修改預設密碼 (admin_password)。');
}
