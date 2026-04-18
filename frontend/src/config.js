/**
 * 部署時請把 API_URL 換成你的 Google Apps Script Web App URL。
 * 格式類似：https://script.google.com/macros/s/AKfycbxxxxxxx/exec
 *
 * 取得方式：Apps Script → 部署 → 新增部署作業 → 網頁應用程式
 * 存取權選「所有人」，複製取得的 URL。
 */
export const API_URL = import.meta.env.VITE_API_URL || 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';

export const APP_CONFIG = {
  // 本地快取時間（毫秒）：開 App 之後多久內再開不重新打 API
  cacheMs: 30_000,

  // 顯示於 Dashboard 的 Top N
  leaderboardTop: 10
};
