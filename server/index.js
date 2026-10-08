// Сервер ditrihh (Yandex Cloud Functions, Node.js 18+): рейтинг недели, лиги, сохранение прогресса,
// привязка Telegram-аккаунта к сайту.
// Переменные окружения: BOT_TOKEN — токен бота, BUCKET — приватный бакет для данных,
// VK_CLIENT_ID — ID приложения VK ID, YA_CLIENT_ID — ClientID приложения Яндекс ID.
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

// Понедельник недели по Москве (back = сколько недель назад)
function weekKey(back = 0) {
  const d = new Date(Date.now() + 3 * 3600e3 - back * 7 * 864e5);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const displayName = u =>
  ([u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'Гитарист')).slice(0, 32);

// Object Storage: авторизация IAM-токеном сервисного аккаунта функции
const objUrl = key => `https://storage.yandexcloud.net/${process.env.BUCKET}/${key}`;
async function loadJSON(key, token, fallback) {
  const r = await fetch(objUrl(key), { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return fallback;
  if (!r.ok) throw new Error('storage read ' + r.status);
  return r.json();
}
const loadList = (key, token) => loadJSON(key, token, []);
async function saveList(key, list, token) {
  const r = await fetch(objUrl(key), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(list),
  });
  if (!r.ok) throw new Error('storage write ' + r.status);
}

async function deleteObj(key, token) {
  await fetch(objUrl(key), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

/* ===== Привязка Telegram к сайту и общий прогресс ===== */
const LINK_TTL = 15 * 60 * 1000;      // ссылка привязки живёт 15 минут
const MAX_PROGRESS = 96 * 1024;       // предел размера прогресса
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const okNonce = n => typeof n === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(n);
const pubUser = u => ({ id: u.id, first_name: u.first_name || '', last_name: u.last_name || '', username: u.username || '', photo_url: u.photo_url || '' });

// Аккаунт = ключ хранения прогресса. Сейчас tg_<id>; позже появятся vk_<id> и ya_<id> (вход через VK ID / Яндекс ID),
// а Telegram будет привязываться к ним через alias/tg_<id>.json → { acc }.
async function accOfTg(id, token) {
  const a = await loadJSON(`alias/tg_${id}.json`, token, null);
  return a && a.acc ? a.acc : `tg_${id}`;
}
// вход с сайта: токен, выданный после подтверждения в Telegram
async function userFromToken(tok, token) {
  if (typeof tok !== 'string' || tok.length < 20 || tok.length > 100) return null;
  const rec = await loadJSON(`tokens/${sha(tok)}.json`, token, null);
  return rec && rec.user ? Object.assign({}, rec.user, { acc: rec.acc || `tg_${rec.user.id}` }) : null;
}

// сайт спрашивает: подтвердил ли человек привязку в Telegram?
async function handleClaim(body, token) {
  if (!okNonce(body.nonce)) return reply(400, { error: 'bad nonce' });
  const key = `links/${body.nonce}.json`;
  const link = await loadJSON(key, token, null);
  if (!link) return reply(200, { pending: true });
  await deleteObj(key, token);
  if (Date.now() - link.t > LINK_TTL) return reply(200, { expired: true });
  // уже вошёл через VK/Яндекс — привязываем Telegram к этому аккаунту
  const sess = body.token ? await userFromToken(body.token, token) : null;
  if (sess && sess.acc && !/^tg_/.test(sess.acc)) {
    await attachTg(sess.acc, link.user, token);
    return reply(200, { token: body.token, user: sess, tg: link.user });
  }
  const tok = crypto.randomBytes(32).toString('base64url');
  const acc = await accOfTg(link.user.id, token);
  await saveList(`tokens/${sha(tok)}.json`, { user: link.user, acc, t: Date.now() }, token);
  return reply(200, { token: tok, user: link.user });
}

/* ===== Вход через VK ID и Яндекс ID ===== */
const progressXp = rec => { try { return Number(JSON.parse(rec.data).xp) || 0; } catch { return 0; } };
async function accMeta(acc, token) { return loadJSON(`accounts/${acc}.json`, token, {}); }
// привязать Telegram к аккаунту сайта: дальше бот пишет прогресс туда же; берём прогресс, где больше опыта
async function attachTg(acc, tgUser, token) {
  const tgAcc = `tg_${tgUser.id}`;
  const [mine, theirs] = await Promise.all([loadJSON(`progress/${acc}.json`, token, null), loadJSON(`progress/${tgAcc}.json`, token, null)]);
  if (theirs && (!mine || progressXp(theirs) > progressXp(mine))) await saveList(`progress/${acc}.json`, { data: theirs.data, t: Date.now() }, token);
  await saveList(`alias/tg_${tgUser.id}.json`, { acc }, token);
  const meta = await accMeta(acc, token);
  meta.tg = pubUser(tgUser);
  await saveList(`accounts/${acc}.json`, meta, token);
}
async function issueSession(user, provider, token) {
  const alias = await loadJSON(`alias/${user.id}.json`, token, null);
  const acc = alias && alias.acc ? alias.acc : user.id;
  const meta = await accMeta(acc, token);
  meta[provider] = user; meta.t = Date.now();
  await saveList(`accounts/${acc}.json`, meta, token);
  const tok = crypto.randomBytes(32).toString('base64url');
  await saveList(`tokens/${sha(tok)}.json`, { user, acc, t: Date.now() }, token);
  return reply(200, { token: tok, user, tg: meta.tg || null });
}
async function handleLoginYa(body, token) {
  if (!process.env.YA_CLIENT_ID) return reply(503, { error: 'yandex not configured' });
  if (typeof body.access_token !== 'string' || body.access_token.length > 200) return reply(400, { error: 'bad token' });
  const r = await fetch('https://login.yandex.ru/info?format=json', { headers: { Authorization: 'OAuth ' + body.access_token } });
  if (!r.ok) return reply(401, { error: 'yandex rejected' });
  const j = await r.json();
  // токен должен быть выдан именно нашему приложению — иначе чужое приложение могло бы войти от имени человека
  if (String(j.client_id) !== String(process.env.YA_CLIENT_ID)) return reply(401, { error: 'wrong client' });
  const user = { id: `ya_${j.id}`, first_name: j.first_name || j.display_name || '', last_name: j.last_name || '', username: j.login || '',
    photo_url: j.default_avatar_id && !j.is_avatar_empty ? `https://avatars.yandex.net/get-yapic/${j.default_avatar_id}/islands-200` : '', provider: 'ya' };
  return issueSession(user, 'ya', token);
}
const VK_HOSTS = ['https://id.vk.ru', 'https://id.vk.com'];
async function vkPost(path, params) {
  let last;
  for (const h of VK_HOSTS) {
    try { const r = await fetch(h + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
      const j = await r.json(); if (r.ok && !j.error) return j; last = j; } catch (e) { last = { error: String(e) }; }
  }
  throw new Error('vk ' + JSON.stringify(last));
}
async function handleLoginVk(body, token) {
  const client_id = process.env.VK_CLIENT_ID;
  if (!client_id) return reply(503, { error: 'vk not configured' });
  const okStr = (v, n) => typeof v === 'string' && v.length > 0 && v.length <= n;
  if (!okStr(body.code, 2000) || !okStr(body.code_verifier, 200) || !okStr(body.device_id, 200) || !okStr(body.redirect_uri, 300) || !okStr(body.state, 200)) return reply(400, { error: 'bad params' });
  if (!/^https:\/\/(www\.)?ditrihh\.ru\/|^https:\/\/ditrihh87\.github\.io\/|^http:\/\/localhost(:\d+)?\//.test(body.redirect_uri)) return reply(400, { error: 'bad redirect' });
  let tk;
  try { tk = await vkPost('/oauth2/auth', { grant_type: 'authorization_code', code: body.code, code_verifier: body.code_verifier, client_id, device_id: body.device_id, redirect_uri: body.redirect_uri, state: body.state }); }
  catch (e) { console.error(e); return reply(401, { error: 'vk rejected' }); }
  let u = {};
  try { const info = await vkPost('/oauth2/user_info', { client_id, access_token: tk.access_token }); u = info.user || {}; } catch (e) { console.error(e); }
  const id = u.user_id || tk.user_id;
  if (!id) return reply(401, { error: 'vk no user' });
  const user = { id: `vk_${id}`, first_name: u.first_name || '', last_name: u.last_name || '', username: '', photo_url: u.avatar || '', provider: 'vk' };
  return issueSession(user, 'vk', token);
}

async function handleUser(body, user, viaTg, token) {
  const acc = user.acc || await accOfTg(user.id, token);
  if (body.action === 'link') {            // подтверждение привязки — только из самого Telegram
    if (!viaTg) return reply(403, { error: 'telegram only' });
    if (!okNonce(body.nonce)) return reply(400, { error: 'bad nonce' });
    await saveList(`links/${body.nonce}.json`, { user: pubUser(user), t: Date.now() }, token);
    return reply(200, { ok: true });
  }
  if (body.action === 'save') {
    const p = body.progress;
    if (typeof p !== 'string' || p.length > MAX_PROGRESS) return reply(400, { error: 'bad progress' });
    try { JSON.parse(p); } catch { return reply(400, { error: 'bad progress' }); }
    await saveList(`progress/${acc}.json`, { data: p, t: Date.now() }, token);
    return reply(200, { ok: true });
  }
  if (body.action === 'load') {
    const rec = await loadJSON(`progress/${acc}.json`, token, null);
    return reply(200, { data: rec ? rec.data : null, t: rec ? rec.t : 0 });
  }
  if (body.action === 'unlink') {
    if (typeof body.token === 'string') await deleteObj(`tokens/${sha(body.token)}.json`, token);
    return reply(200, { ok: true });
  }
  return null;
}

/* ===== Twitch: последняя запись стрима и статус эфира (для главной сайта) =====
   Нужны переменные окружения TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET (приложение на dev.twitch.tv). */
const TWITCH_LOGIN = 'ditrihh';
const TWITCH_CACHE = 10 * 60 * 1000;
async function twitchAppToken(token) {
  const c = await loadJSON('cache/twitch_token.json', token, null);
  if (c && c.exp > Date.now() + 60000) return c.access_token;
  const q = new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' });
  const r = await fetch('https://id.twitch.tv/oauth2/token?' + q, { method: 'POST' });
  if (!r.ok) throw new Error('twitch token ' + r.status);
  const j = await r.json();
  await saveList('cache/twitch_token.json', { access_token: j.access_token, exp: Date.now() + j.expires_in * 1000 }, token);
  return j.access_token;
}
async function helix(path, tw) {
  const r = await fetch('https://api.twitch.tv/helix/' + path, { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + tw } });
  if (!r.ok) throw new Error('helix ' + r.status);
  return (await r.json()).data || [];
}
async function handleTwitch(token) {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return reply(200, { error: 'not configured' });
  const cached = await loadJSON('cache/twitch_latest.json', token, null);
  if (cached && Date.now() - cached.t < TWITCH_CACHE) return reply(200, cached.v);
  const tw = await twitchAppToken(token);
  const [user] = await helix('users?login=' + TWITCH_LOGIN, tw);
  if (!user) return reply(200, { error: 'no user' });
  const [stream] = await helix('streams?user_id=' + user.id, tw);
  let vids = await helix(`videos?user_id=${user.id}&type=archive&first=1`, tw);
  if (!vids.length) vids = await helix(`videos?user_id=${user.id}&first=1`, tw);
  const v = vids[0];
  const out = {
    live: !!stream,
    video: v ? { id: v.id, title: v.title, created_at: v.created_at, duration: v.duration, thumb: (v.thumbnail_url || '').replace('%{width}', '640').replace('%{height}', '360') } : null,
  };
  await saveList('cache/twitch_latest.json', { t: Date.now(), v: out }, token);
  return reply(200, out);
}

function view(list, myId) {
  list.sort((a, b) => b.score - a.score || a.t - b.t);
  const ranked = list.map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, me: e.id === myId }));
  return { top: ranked.slice(0, TOP_SIZE), me: ranked.find(e => e.me) || null };
}

/* ===== Лиги недели по XP ===== */
const LEAGUES = 6;          // Гараж … Стадион (названия в приложении)
const PROMOTE = 5;          // столько лучших поднимаются
const DEMOTE = 5;           // столько последних опускаются (если в лиге от 10 игроков)
const MAX_XP_CALL = 300;    // защита от накрутки: не больше за один запрос
const MAX_XP_WEEK = 7000;   // и не больше за неделю
const LEAGUE_SHOW = 30;

const sortXP = list => list.sort((a, b) => b.xp - a.xp || a.t - b.t);

// при первом заходе на новой неделе подводим итоги прошлой: повышение / понижение
async function settleUser(id, token) {
  const ukey = `users/${id}.json`;
  const u = await loadJSON(ukey, token, null) || { tier: 0, week: '' };
  const now = weekKey();
  let result = null;
  if (u.week && u.week !== now) {
    const prev = sortXP(await loadList(`league/${u.week}/${u.tier}.json`, token));
    const i = prev.findIndex(e => e.id === id);
    if (i >= 0) {
      const from = u.tier, n = prev.length;
      if (i < PROMOTE && u.tier < LEAGUES - 1 && prev[i].xp > 0) u.tier++;
      else if (n >= 10 && i >= n - DEMOTE && u.tier > 0) u.tier--;
      result = { from, to: u.tier, place: i + 1, xp: prev[i].xp };
    }
  }
  const changed = u.week !== now;
  u.week = now;
  if (changed) await saveList(ukey, u, token);
  return { u, result };
}

function leagueView(list, id, tier) {
  sortXP(list);
  const n = list.length;
  const rows = list.map((e, i) => ({ rank: i + 1, name: e.name, xp: e.xp, total: e.total || 0, me: e.id === id }));
  const me = rows.find(r => r.me) || null;
  // показываем топ и окрестность игрока
  let show = rows.slice(0, LEAGUE_SHOW);
  if (me && me.rank > LEAGUE_SHOW) show = show.concat(rows.slice(Math.max(LEAGUE_SHOW, me.rank - 3), me.rank + 2));
  return { tier, players: n, promote: tier < LEAGUES - 1 ? PROMOTE : 0, demote: n >= 10 && tier > 0 ? DEMOTE : 0, rows: show, me };
}

async function handleLeague(body, user, token) {
  const lid = user.lid || user.id;
  const { u, result } = await settleUser(lid, token);
  const key = `league/${u.week}/${u.tier}.json`;
  let list = await loadList(key, token);
  if (body.action === 'xp') {
    const add = Math.floor(Number(body.add));
    const total = Math.max(0, Math.floor(Number(body.total)) || 0);
    if (!(add > 0 && add <= MAX_XP_CALL)) return reply(400, { error: 'bad xp' });
    const name = displayName(user);
    let mine = list.find(e => e.id === lid);
    if (!mine) { mine = { id: lid, name, xp: 0, total, t: Date.now() }; list.push(mine); }
    mine.name = name; mine.total = Math.max(mine.total || 0, total);
    if (mine.xp + add <= MAX_XP_WEEK) { mine.xp += add; mine.t = Date.now(); }
    await saveList(key, list, token);
  }
  return reply(200, { ...leagueView(list, lid, u.tier), week: u.week, result });
}

/* ===== Рейтинг песен: оценка 1–5 от каждого посетителя (анонимный id из браузера) ===== */
const okSong = v => typeof v === 'string' && /^[a-z0-9-]{1,80}$/.test(v);
const okVoter = v => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
async function handleRatings(token) {
  return reply(200, { ratings: await loadJSON('ratings/summary.json', token, {}) });
}
async function handleRate(body, token) {
  const stars = Math.round(Number(body.stars));
  if (!okSong(body.song) || !okVoter(body.voter) || !(stars >= 1 && stars <= 5)) return reply(400, { error: 'bad rating' });
  const key = `ratings/songs/${body.song}.json`;
  const votes = await loadJSON(key, token, {});
  votes[body.voter] = stars;
  await saveList(key, votes, token);
  const vals = Object.values(votes), n = vals.length;
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / n * 10) / 10;
  const sum = await loadJSON('ratings/summary.json', token, {});
  sum[body.song] = { avg, n };
  await saveList('ratings/summary.json', sum, token);
  return reply(200, { avg, n, mine: stars });
}

module.exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod && event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });

  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
    body = JSON.parse(raw || '{}');
  } catch { return reply(400, { error: 'bad json' }); }

  const token = context && context.token && context.token.access_token;
  if (!token) return reply(500, { error: 'no service account' });

  if (body.action === 'twitch') {
    try { return await handleTwitch(token); }
    catch (e) { console.error(e); return reply(502, { error: 'twitch' }); }
  }

  if (body.action === 'ratings' || body.action === 'rate') {
    try { return body.action === 'rate' ? await handleRate(body, token) : await handleRatings(token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  if (body.action === 'login_vk' || body.action === 'login_ya') {
    try { return body.action === 'login_vk' ? await handleLoginVk(body, token) : await handleLoginYa(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'login' }); }
  }

  if (body.action === 'claim') {
    try { return await handleClaim(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  let user = verify(body.initData, process.env.BOT_TOKEN);
  const viaTg = !!user;
  if (!user && body.token) {
    try { user = await userFromToken(body.token, token); } catch (e) { console.error(e); }
  }
  if (!user) return reply(401, { error: 'unauthorized' });
  // единая личность для лиг и рейтинга: аккаунт сайта (vk_/ya_), если Telegram к нему привязан
  if (!user.acc) { try { user.acc = await accOfTg(user.id, token); } catch (e) { user.acc = `tg_${user.id}`; } }
  const lid = /^tg_/.test(user.acc) ? user.id : user.acc;
  user.lid = lid;

  if (['link', 'save', 'load', 'unlink'].includes(body.action)) {
    try { return await handleUser(body, user, viaTg, token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  if (body.action === 'league' || body.action === 'xp') {
    try { return await handleLeague(body, user, token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

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
      const mine = list.find(e => e.id === lid);
      if (!mine) list.push({ id: lid, name, score, t: Date.now() });
      else { mine.name = name; if (score > mine.score) { mine.score = score; mine.t = Date.now(); } }
      list.sort((a, b) => b.score - a.score || a.t - b.t);
      list = list.slice(0, MAX_PLAYERS);
      await saveList(key, list, token);
    }
    return reply(200, view(list, lid));
  } catch (e) {
    console.error(e);
    return reply(502, { error: 'storage' });
  }
};
