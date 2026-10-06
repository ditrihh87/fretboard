// Сервер рейтинга «Нота на грифе» для Yandex Cloud Functions (Node.js 18+)
// Переменные окружения: BOT_TOKEN — токен бота, BUCKET — приватный бакет для данных.
// У функции должен быть сервисный аккаунт с ролью storage.editor.

const crypto = require('node:crypto');

const MAX_PLAYERS = 1000;  // сколько игроков хранить в одном рейтинге
const TOP_SIZE = 20;       // сколько показывать в топе
const MAX_SCORE = 90;      // больше за 60 секунд не набрать — защита от накрутки

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};
const reply = (statusCode, data) => ({ statusCode, headers: HEADERS, body: JSON.stringify(data) });

// Проверка, что запрос пришёл из Telegram от настоящего пользователя
function verify(initData, botToken) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if (!hash || !botToken) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const sig = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (sig.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400) return null;
  try { return JSON.parse(params.get('user')); } catch { return null; }
}

// Понедельник текущей недели по Москве
function weekKey() {
  const d = new Date(Date.now() + 3 * 3600e3);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const displayName = u =>
  ([u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'Гитарист')).slice(0, 32);

// Object Storage: авторизация IAM-токеном сервисного аккаунта функции
const objUrl = key => `https://storage.yandexcloud.net/${process.env.BUCKET}/${key}`;
async function loadList(key, token) {
  const r = await fetch(objUrl(key), { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('storage read ' + r.status);
  return r.json();
}
async function saveList(key, list, token) {
  const r = await fetch(objUrl(key), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(list),
  });
  if (!r.ok) throw new Error('storage write ' + r.status);
}

function view(list, myId) {
  list.sort((a, b) => b.score - a.score || a.t - b.t);
  const ranked = list.map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, me: e.id === myId }));
  return { top: ranked.slice(0, TOP_SIZE), me: ranked.find(e => e.me) || null };
}

module.exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod && event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });

  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
    body = JSON.parse(raw || '{}');
  } catch { return reply(400, { error: 'bad json' }); }

  const user = verify(body.initData, process.env.BOT_TOKEN);
  if (!user) return reply(401, { error: 'unauthorized' });

  const token = context && context.token && context.token.access_token;
  if (!token) return reply(500, { error: 'no service account' });

  const mode = body.mode === 'name' ? 'name' : 'find';
  const max = Number(body.max) === 12 ? 12 : 5;
  const key = `lb/${weekKey()}/${mode}-${max}.json`;

  try {
    let list = await loadList(key, token);
    if (body.action === 'submit') {
      const score = Math.floor(Number(body.score));
      const total = Math.floor(Number(body.total));
      if (!(score >= 0 && total >= score && score <= MAX_SCORE)) return reply(400, { error: 'bad score' });
      const name = displayName(user);
      const mine = list.find(e => e.id === user.id);
      if (!mine) list.push({ id: user.id, name, score, t: Date.now() });
      else { mine.name = name; if (score > mine.score) { mine.score = score; mine.t = Date.now(); } }
      list.sort((a, b) => b.score - a.score || a.t - b.t);
      list = list.slice(0, MAX_PLAYERS);
      await saveList(key, list, token);
    }
    return reply(200, view(list, user.id));
  } catch (e) {
    console.error(e);
    return reply(502, { error: 'storage' });
  }
};
