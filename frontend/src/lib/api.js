import { API_URL } from '../config';

async function get(params = {}) {
  const url = new URL(API_URL);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Network error: ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Unknown error');
  return data.data;
}

async function post(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('Network error: ' + res.status);
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || 'Unknown error');
    err.code = data.code;
    throw err;
  }
  return data.data;
}

export const api = {
  getAll: () => get({ action: 'getAll' }),
  login: (password) => post({ action: 'login', password }),

  addPlayer: (password, name) => post({ action: 'addPlayer', password, name }),
  updatePlayer: (password, payload) => post({ action: 'updatePlayer', password, ...payload }),
  deletePlayer: (password, id) => post({ action: 'deletePlayer', password, id }),

  addTsumo: (password, payload) => post({ action: 'addTsumo', password, ...payload }),
  updateTsumo: (password, payload) => post({ action: 'updateTsumo', password, ...payload }),
  deleteTsumo: (password, id) => post({ action: 'deleteTsumo', password, id }),

  addSettlement: (password, payload) => post({ action: 'addSettlement', password, ...payload }),
  updateSettlement: (password, payload) => post({ action: 'updateSettlement', password, ...payload }),
  deleteSettlement: (password, id) => post({ action: 'deleteSettlement', password, id }),

  addWithdrawal: (password, payload) => post({ action: 'addWithdrawal', password, ...payload }),
  deleteWithdrawal: (password, id) => post({ action: 'deleteWithdrawal', password, id }),

  updateSettings: (password, settings) => post({ action: 'updateSettings', password, settings })
};
