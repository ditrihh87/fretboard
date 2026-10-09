// Сервер ditrihh (Yandex Cloud Functions, Node.js 18+): рейтинг недели, лиги, сохранение прогресса,
// привязка Telegram-аккаунта к сайту.
// Переменные окружения: BOT_TOKEN — токен бота, BUCKET — приватный бакет для данных,
// VK_CLIENT_ID — ID приложения VK ID, YA_CLIENT_ID — ClientID приложения Яндекс ID,
// BOT_TOKEN_NEW — токен второго бота (@ditrihh_bot): приложение работает из обоих ботов.
// DonationAlerts: DA_CLIENT_ID, DA_CLIENT_SECRET (приложение на donationalerts.com/application/clients),
// Аккаунт владельца «ditrihh» (admin_ditrihh): вход на login.html?admin по ключу ADMIN_KEY; значок автора и все права.
// ADMIN_ACC — дополнительные аккаунты с правами владельца (напр. ya_123456; через запятую).
// ADMIN_KEY — секретный ключ владельца (для подключения DonationAlerts), DA_GOAL — цель «Название|сумма|с какой даты», напр. «Новая гитара|50000|2026-10-01».
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
// вход владельца: аккаунт «ditrihh» по секретному ключу ADMIN_KEY
async function handleLoginAdmin(body, token) {
  if (!okAdmin(body.key)) { await new Promise(r => setTimeout(r, 1500)); return reply(401, { error: 'bad key' }); }
  const user = { id: ADMIN_ID, first_name: ADMIN_NAME, last_name: '', username: 'ditrihh', photo_url: 'https://ditrihh.ru/brand/ditrihh-avatar-640.png', provider: 'admin' };
  return issueSession(user, 'admin', token);
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

/* ===== Комментарии под песнями: писать могут вошедшие на сайт через Яндекс ID или VK ID ===== */
const MAX_COMMENTS = 500;     // храним последние 500 комментариев у песни
const COMMENT_LEN = 1000;     // предел длины комментария
const COMMENT_GAP = 10e3;     // не чаще одного комментария в 10 секунд
const ADMIN_ID = 'admin_ditrihh';
const ADMIN_NAME = 'Тот Самый';   // имя владельца в комментариях (рядом значок ditrihh)
const adminAccs = () => [ADMIN_ID, ...String(process.env.ADMIN_ACC || '').split(',').map(s => s.trim()).filter(Boolean)];
const siteUser = u => u && /^(ya|vk|admin)_/.test(String(u.id)) ? u : null;   // Telegram-вход для комментариев не принимаем
const nameOf = (a, n) => a === ADMIN_ID ? ADMIN_NAME : n;
// ссылки (кроме ditrihh.ru) — комментарий ждёт одобрения владельца
const LINK_RE = /(https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{5,}|\b[a-z0-9-]{2,}\.(ru|com|net|org|io|me|xyz|su|info|biz|cc|top|site|online|shop|store|pro|link|ly|gg|tv|app|club|space|website|ws|to|kz|by|ua)\b|[а-яё0-9-]{2,}\.рф)/i;
const hasLink = t => LINK_RE.test(String(t).replace(/(https?:\/\/)?(www\.)?ditrihh\.ru\S*/gi, ''));
const loadBans = token => loadJSON('comments/_bans.json', token, {});
/* ===== Рейтинг: очки за время на сайте и комментарии → звания и ачивки =====
   stats/<acc>.json — { sec, comments, got: {achId: время}, last }; stats/_ranks.json — { acc: номер звания } для подписи под именем.
   Очки: 1 за минуту на сайте + 10 за комментарий. Новые ачивки — просто добавить строку в ACH. */
const RANKS = [[0, 'Новичок'], [60, 'Слушатель'], [300, 'Бренчащий'], [1000, 'Аккордист'], [3000, 'Гитарист'], [8000, 'Мастер баре'], [20000, 'Рок-звезда'], [50000, 'Легенда']];
const ACH = [
  { id: 'c1', name: 'Первое слово', desc: 'Первый комментарий', k: 'comments', n: 1, icon: '💬' },
  { id: 'c10', name: 'Разговорчивый', desc: '10 комментариев', k: 'comments', n: 10, icon: '🗣️' },
  { id: 'c100', name: 'Душа компании', desc: '100 комментариев', k: 'comments', n: 100, icon: '🎤' },
  { id: 'c1000', name: 'Голос сцены', desc: '1000 комментариев', k: 'comments', n: 1000, icon: '📣' },
  { id: 'h1', name: 'Первый час', desc: '1 час на сайте', k: 'sec', n: 3600, icon: '⏱️' },
  { id: 'h10', name: 'Завсегдатай', desc: '10 часов на сайте', k: 'sec', n: 36000, icon: '🎸' },
  { id: 'h100', name: 'Живёт здесь', desc: '100 часов на сайте', k: 'sec', n: 360000, icon: '🏠' },
];
const PING_SEC = 60;                   // сайт присылает «я тут» раз в минуту, пока вкладка открыта и человек что-то делает
const statPoints = st => Math.floor((st.sec || 0) / 60) + (st.comments || 0) * 10;
const rankIdx = p => { let i = 0; RANKS.forEach((r, j) => { if (p >= r[0]) i = j; }); return i; };
const statKey = acc => `stats/${acc}.json`;
async function bumpStats(acc, add, token) {
  const st = await loadJSON(statKey(acc), token, { sec: 0, comments: 0, got: {} });
  if (add.ping) {   // «я тут» засчитываем не чаще раза в минуту
    if (st.last && Date.now() - st.last < (PING_SEC - 8) * 1000) return { skip: true, fresh: [], up: null };
    st.last = Date.now();
  }
  const before = rankIdx(statPoints(st));
  if (add.sec) st.sec = (st.sec || 0) + add.sec;
  if (add.comments) st.comments = Math.max(0, (st.comments || 0) + add.comments);
  st.got = st.got || {};
  const fresh = [];
  for (const a of ACH) if (!st.got[a.id] && (st[a.k] || 0) >= a.n) { st.got[a.id] = Date.now(); fresh.push(a.id); }
  await saveList(statKey(acc), st, token);
  const after = rankIdx(statPoints(st));
  if (after !== before || fresh.length) {
    const ranks = await loadJSON('stats/_ranks.json', token, {});
    if (ranks[acc] !== after) { ranks[acc] = after; await saveList('stats/_ranks.json', ranks, token); }
  }
  return { st, fresh, up: after > before ? RANKS[after][1] : null };
}
function statView(st) {
  const p = statPoints(st), i = rankIdx(p), nx = RANKS[i + 1];
  return { sec: st.sec || 0, comments: st.comments || 0, points: p, rank: RANKS[i][1], level: i + 1,
    from: RANKS[i][0], next: nx ? { rank: nx[1], at: nx[0] } : null,
    ach: ACH.map(a => ({ id: a.id, name: a.name, desc: a.desc, icon: a.icon, got: (st.got || {})[a.id] || 0, have: Math.min(st[a.k] || 0, a.n), need: a.n, k: a.k })) };
}
const achNames = ids => ids.map(id => { const a = ACH.find(x => x.id === id); return a && { id, name: a.name, icon: a.icon, desc: a.desc }; }).filter(Boolean);
async function handleStats(body, token) {
  const u = await commentUser(body, token);
  if (!u) return reply(401, { error: 'login' });
  if (body.action === 'ping') {
    const r = await bumpStats(u.acc, { sec: PING_SEC, ping: true }, token);
    return reply(200, { ok: !r.skip, fresh: achNames(r.fresh), up: r.up });
  }
  const st = await loadJSON(statKey(u.acc), token, { sec: 0, comments: 0, got: {} });
  return reply(200, statView(st));
}

const pubComment = (c, acc, admin, ranks) => ({ pending: !!c.pending, id: c.id, rank: ranks && ranks[c.acc] != null ? RANKS[ranks[c.acc]][1] : RANKS[0][1], name: nameOf(c.acc, c.name), photo: c.photo || '', text: c.text, t: c.t, admin: !!c.admin, can: !!acc && (c.acc === acc || admin), re: c.re || null, to: c.to ? nameOf(c.toAcc, c.to) : null });
async function commentUser(body, token) { return body.token ? siteUser(await userFromToken(body.token, token)) : null; }
async function handleComments(body, token) {
  if (!okSong(body.song)) return reply(400, { error: 'bad song' });
  const [list, u, bans, ranks] = await Promise.all([loadJSON(`comments/${body.song}.json`, token, []), commentUser(body, token).catch(() => null), loadBans(token), loadJSON('stats/_ranks.json', token, {})]);
  const acc = u && u.acc, admin = !!acc && adminAccs().includes(acc);
  // на проверке — видят только автор и владелец; забаненных не видит никто, кроме владельца
  const vis = list.filter(c => (admin || !bans[c.acc]) && (!c.pending || admin || c.acc === acc));
  return reply(200, { comments: vis.map(c => pubComment(c, acc, admin, ranks)), me: acc || null, admin, banned: !!(acc && bans[acc]) });
}
async function handleComment(body, token) {
  if (!okSong(body.song)) return reply(400, { error: 'bad song' });
  const u = await commentUser(body, token);
  if (!u) return reply(401, { error: 'login' });
  if ((await loadBans(token))[u.acc]) return reply(403, { error: 'banned' });
  const text = String(body.text || '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || text.length > COMMENT_LEN) return reply(400, { error: 'bad text' });
  const key = `comments/${body.song}.json`;
  let list = await loadJSON(key, token, []);
  if (list.some(c => c.acc === u.acc && Date.now() - c.t < COMMENT_GAP)) return reply(429, { error: 'too fast' });
  const admin = adminAccs().includes(u.acc);
  const c = { id: crypto.randomBytes(9).toString('base64url'), acc: u.acc, name: nameOf(u.acc, displayName(u)), photo: u.photo_url || '', text, t: Date.now(), admin };
  // ответ: ветка всегда одна — к первому комментарию; to — кому отвечают (имя)
  if (body.re != null) {
    const p = typeof body.re === 'string' && list.find(x => x.id === body.re);
    if (!p) return reply(400, { error: 'no parent' });
    c.re = p.re || p.id; if (p.acc !== u.acc) { c.to = nameOf(p.acc, p.name); c.toAcc = p.acc; }   // себе отвечаем без обращения
  }
  if (!admin && hasLink(text)) c.pending = true;
  list.push(c); list = list.slice(-MAX_COMMENTS);
  await saveList(key, list, token);
  let r = { fresh: [], up: null };
  if (!c.pending) { try { r = await bumpStats(u.acc, { comments: 1 }, token); } catch (e) { console.error(e); } }
  const ranks = await loadJSON('stats/_ranks.json', token, {});
  return reply(200, { comment: pubComment(c, u.acc, admin, ranks), fresh: achNames(r.fresh), up: r.up });
}
// владелец: одобрить комментарий со ссылкой / забанить автора (его комментарии под этой песней удаляются, остальные скрываются)
async function handleCommentMod(body, token) {
  if (!okSong(body.song) || typeof body.id !== 'string') return reply(400, { error: 'bad params' });
  const u = await commentUser(body, token);
  if (!u || !adminAccs().includes(u.acc)) return reply(403, { error: 'admin only' });
  const key = `comments/${body.song}.json`;
  let list = await loadJSON(key, token, []);
  const c = list.find(x => x.id === body.id);
  if (!c) return reply(404, { error: 'no comment' });
  if (body.action === 'comment_ok') { delete c.pending; await saveList(key, list, token); await bumpStats(c.acc, { comments: 1 }, token).catch(console.error); return reply(200, { ok: true }); }
  if (adminAccs().includes(c.acc)) return reply(400, { error: 'cannot ban admin' });
  const bans = await loadBans(token);
  bans[c.acc] = { name: c.name, t: Date.now(), song: body.song };
  await saveList('comments/_bans.json', bans, token);
  const gone = list.filter(x => x.acc === c.acc).map(x => x.id);
  const counted = list.filter(x => x.acc === c.acc && !x.pending).length;
  if (counted) await bumpStats(c.acc, { comments: -counted }, token).catch(console.error);
  list = list.filter(x => x.acc !== c.acc);
  await saveList(key, list, token);
  return reply(200, { ok: true, removed: gone });
}
async function handleBans(body, token) {
  const u = await commentUser(body, token);
  if (!u || !adminAccs().includes(u.acc)) return reply(403, { error: 'admin only' });
  const bans = await loadBans(token);
  if (body.action === 'unban' && typeof body.acc === 'string') { delete bans[body.acc]; await saveList('comments/_bans.json', bans, token); }
  return reply(200, { bans: Object.entries(bans).map(([acc, b]) => ({ acc, name: b.name, t: b.t, song: b.song })) });
}
async function handleCommentDel(body, token) {
  if (!okSong(body.song) || typeof body.id !== 'string') return reply(400, { error: 'bad params' });
  const u = await commentUser(body, token);
  if (!u) return reply(401, { error: 'login' });
  const key = `comments/${body.song}.json`, list = await loadJSON(key, token, []);
  const i = list.findIndex(c => c.id === body.id);
  if (i < 0) return reply(200, { ok: true });
  if (list[i].acc !== u.acc && !adminAccs().includes(u.acc)) return reply(403, { error: 'not yours' });
  const [del] = list.splice(i, 1);
  await saveList(key, list, token);
  if (!del.pending) await bumpStats(del.acc, { comments: -1 }, token).catch(console.error);   // удалённый комментарий не засчитывается
  return reply(200, { ok: true });
}

/* ===== DonationAlerts: статистика донатов для сайта и панели Twitch ===== */
const DA = 'https://www.donationalerts.com';
const DA_CACHE_MS = 60 * 1000;           // статистику пересчитываем не чаще раза в минуту
const DA_MAX_PAGES = 40;                 // за один раз дочитываем не больше 40 страниц (1200 донатов)
// примерный пересчёт в рубли для рейтинга (точные суммы показываем в исходной валюте)
const RUB = { RUB: 1, USD: 90, EUR: 100, KZT: 0.18, BYN: 28, UAH: 2.2, BRL: 16, TRY: 2.6, PLN: 23 };
const toRub = (a, c) => Math.round(Number(a || 0) * (RUB[String(c || 'RUB').toUpperCase()] ?? 0));
const daName = n => String(n || '').trim().slice(0, 32) || 'Аноним';
const okAdmin = k => !!process.env.ADMIN_KEY && typeof k === 'string' && k.length < 100 &&
  crypto.timingSafeEqual(Buffer.from(sha(k)), Buffer.from(sha(process.env.ADMIN_KEY)));

async function daToken(token) {
  const t = await loadJSON('da/token.json', token, null);
  if (!t) return null;
  if (t.exp && Date.now() < t.exp - 3600e3) return t.access_token;
  // обновляем токен
  const r = await fetch(DA + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: process.env.DA_CLIENT_ID, client_secret: process.env.DA_CLIENT_SECRET, scope: 'oauth-user-show oauth-donation-index' }) });
  if (!r.ok) { console.error('da refresh', r.status); return t.access_token; }
  const j = await r.json();
  const nt = { access_token: j.access_token, refresh_token: j.refresh_token || t.refresh_token, exp: Date.now() + (j.expires_in || 0) * 1000 };
  await saveList('da/token.json', nt, token);
  return nt.access_token;
}
// владелец подключает DonationAlerts: код из da-connect.html → токен
async function handleDaConnect(body, token) {
  if (!okAdmin(body.key)) return reply(403, { error: 'bad key' });
  if (!process.env.DA_CLIENT_ID || !process.env.DA_CLIENT_SECRET) return reply(503, { error: 'DA not configured' });
  if (typeof body.code !== 'string' || typeof body.redirect_uri !== 'string') return reply(400, { error: 'bad params' });
  const r = await fetch(DA + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: process.env.DA_CLIENT_ID, client_secret: process.env.DA_CLIENT_SECRET, redirect_uri: body.redirect_uri, code: body.code }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { console.error('da connect', r.status, j); return reply(401, { error: 'DA rejected' }); }
  await saveList('da/token.json', { access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + (j.expires_in || 0) * 1000 }, token);
  await deleteObj('da/all.json', token); await deleteObj('cache/da_stats.json', token);
  let user = '';
  try { const u = await (await fetch(DA + '/api/v1/user/oauth', { headers: { Authorization: 'Bearer ' + j.access_token } })).json(); user = u.data && u.data.name || ''; } catch {}
  return reply(200, { ok: true, user });
}
// все донаты храним у себя (без сообщений): сначала новые, потом понемногу дочитываем историю.
// За один вызов работаем не дольше DA_BUDGET_MS, чтобы функция не упёрлась в таймаут.
const DA_BUDGET_MS = 2500;
const DA_KEEP_MS = 40 * 864e5;            // храним и дочитываем только последние 40 дней — для топа за месяц и неделю хватает
const daTs = t => Date.parse(String(t || '').replace(' ', 'T') + 'Z') || 0;
async function daSync(token, report) {
  const t0 = Date.now(), rep = report || {};
  const at = await daToken(token);
  rep.token = !!at;
  if (!at) return null;
  const store = await loadJSON('da/all.json', token, { list: [], back: 1 });
  if (store.back === undefined) store.back = 0;
  const known = new Set(store.list.map(d => d.id));
  const pick = d => ({ id: d.id, n: daName(d.username), a: Number(d.amount) || 0, c: String(d.currency || 'RUB').toUpperCase(), t: String(d.created_at || '') });
  const getPage = async page => {
    const r = await fetch(`${DA}/api/v1/alerts/donations?page=${page}`, { headers: { Authorization: 'Bearer ' + at } });
    rep.httpStatus = r.status;
    if (!r.ok) { rep.error = 'DonationAlerts ответил ' + r.status; return null; }
    rep.pages = (rep.pages || 0) + 1;
    const j = await r.json(); rep.lastPage = j.meta && j.meta.last_page; rep.total = j.meta && j.meta.total;
    return j;
  };
  let changed = false;
  // 1) новые донаты — со страницы 1, пока не встретим уже известный
  const fresh = [];
  for (let page = 1; page <= DA_MAX_PAGES && Date.now() - t0 < DA_BUDGET_MS; page++) {
    const j = await getPage(page); if (!j) break;
    let hit = false;
    for (const d of j.data || []) { if (known.has(d.id)) { hit = true; break; } fresh.push(pick(d)); known.add(d.id); }
    if (hit || !j.links || !j.links.next) { if (!store.list.length && j.links && j.links.next) store.back = page + 1; break; }
    if (!store.list.length) store.back = page + 1;
  }
  if (fresh.length) { store.list = fresh.concat(store.list); changed = true; }
  // 2) история — продолжаем с сохранённой страницы, сколько успеем
  const cutoff = Date.now() - DA_KEEP_MS;
  const oldest = () => store.list.length ? daTs(store.list[store.list.length - 1].t) : Infinity;
  if (store.back && oldest() < cutoff) store.back = 0;      // старше 40 дней не нужно
  while (store.back && Date.now() - t0 < DA_BUDGET_MS) {
    const j = await getPage(store.back); if (!j) break;
    for (const d of j.data || []) if (!known.has(d.id)) { store.list.push(pick(d)); known.add(d.id); }
    store.back = j.links && j.links.next && oldest() >= cutoff ? store.back + 1 : 0; changed = true;
  }
  // подчищаем старое, но последние 10 донатов оставляем всегда
  const before = store.list.length;
  store.list = store.list.filter((d, i) => i < 10 || daTs(d.t) >= cutoff);
  if (store.list.length !== before) changed = true;
  rep.count = store.list.length; rep.historyDone = !store.back; rep.ms = Date.now() - t0;
  if (changed) await saveList('da/all.json', store, token);
  return store.list;
}
function daStats(list) {
  const ts = d => Date.parse(d.t.replace(' ', 'T') + 'Z') || 0;
  const top = items => {
    const m = new Map();
    for (const d of items) { const k = d.n.toLowerCase(); const e = m.get(k) || { name: d.n, rub: 0, count: 0 }; e.rub += toRub(d.a, d.c); e.count++; m.set(k, e); }
    return [...m.values()].filter(e => e.name !== 'Аноним').sort((a, b) => b.rub - a.rub).slice(0, 10);
  };
  // календарные периоды по Москве: сегодня с 00:00, неделя с понедельника, месяц с 1-го числа
  const now = Date.now(), MSK = 3 * 3600e3, m = new Date(now + MSK);
  const dayStart = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()) - MSK;
  const weekStart = dayStart - ((m.getUTCDay() + 6) % 7) * 864e5;
  const monthStart = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1) - MSK;
  const since = t0 => list.filter(d => ts(d) >= t0);
  const sum = l => l.reduce((s, d) => s + toRub(d.a, d.c), 0);
  const day = since(dayStart), week = since(weekStart), month = since(monthStart);
  const out = {
    last: list.slice(0, 10).map(d => ({ name: d.n, amount: d.a, currency: d.c, t: d.t })),
    topDay: top(day), topWeek: top(week), topMonth: top(month), topAll: top(list),
    dayRub: sum(day), weekRub: sum(week), monthRub: sum(month), count: list.length, updated: now,
  };
  const g = String(process.env.DA_GOAL || '').split('|');
  if (g[0] && Number(g[1]) > 0) {
    const since = Date.parse(g[2] || '') || 0;
    out.goal = { title: g[0].slice(0, 60), target: Number(g[1]), raised: list.filter(d => ts(d) >= since).reduce((s, d) => s + toRub(d.a, d.c), 0) };
  }
  return out;
}
async function handleDonations(token) {
  const c = await loadJSON('cache/da_stats.json', token, null);
  if (c && Date.now() - c.updated < DA_CACHE_MS) return reply(200, c);
  try {
    const rep = {};
    const list = await daSync(token, rep);
    if (!list) return reply(200, { connected: false });
    const st = Object.assign(daStats(list), { connected: true, loading: !rep.historyDone });
    if (!rep.historyDone) st.updated = Date.now() - DA_CACHE_MS + 5000; // пока грузится история — обновляем чаще
    await saveList('cache/da_stats.json', st, token);
    return reply(200, st);
  } catch (e) { console.error(e); return c ? reply(200, c) : reply(502, { error: 'da' }); }
}

// Подключение DonationAlerts без сайта: открыть в браузере адрес функции с ?da=connect&key=КЛЮЧ
const FN_URL = 'https://functions.yandexcloud.net/d4epurfr35kcn0fl97up';
const page = (title, text, ok) => ({ statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0C0A24;color:#EFECFB;font:600 17px system-ui,sans-serif;text-align:center;padding:24px">` +
    `<div><div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:24px">${title}</h1><p style="color:#B9B4E6;max-width:460px">${text}</p></div>` });
async function handleDaGet(q, token) {
  if (q.da === 'connect') {
    if (!okAdmin(q.key)) return page('Неверный ключ', 'Открой ссылку с правильным ключом владельца.', false);
    if (!process.env.DA_CLIENT_ID) return page('Не настроено', 'Добавь в переменные функции DA_CLIENT_ID и DA_CLIENT_SECRET.', false);
    return { statusCode: 302, headers: { Location: DA + '/oauth/authorize?' + new URLSearchParams({ client_id: process.env.DA_CLIENT_ID, redirect_uri: FN_URL, response_type: 'code', scope: 'oauth-user-show oauth-donation-index', state: q.key }) }, body: '' };
  }
  if (q.da === 'status') {
    if (!okAdmin(q.key)) return page('Неверный ключ', 'Открой ссылку с правильным ключом владельца.', false);
    const rep = {}; let err = '';
    try { await daSync(token, rep); } catch (e) { err = String(e && e.message || e); }
    await deleteObj('cache/da_stats.json', token).catch(() => {});
    const rows = [['Токен DonationAlerts', rep.token ? 'есть' : 'нет — подключи заново'], ['Ответ DonationAlerts', rep.httpStatus || '—'],
      ['Страниц прочитано сейчас', rep.pages || 0], ['Всего донатов в DonationAlerts', rep.total ?? '—'], ['Сохранено у нас (за 40 дней)', rep.count ?? 0],
      ['Последние 40 дней загружены', rep.historyDone ? 'да' : 'ещё нет — обнови страницу ещё раз'], ['Время', (rep.ms || 0) + ' мс'], ['Ошибка', rep.error || err || 'нет']];
    return page('Диагностика DonationAlerts', rows.map(r => `${r[0]}: <b style="color:#EFECFB">${r[1]}</b>`).join('<br>'), !(rep.error || err) && rep.token);
  }
  if (q.code) {
    const r = await handleDaConnect({ key: q.state, code: q.code, redirect_uri: FN_URL }, token);
    const j = JSON.parse(r.body);
    return j.ok ? page('DonationAlerts подключён', `Аккаунт ${j.user || ''} подключён. Статистика появится в панели Twitch в течение пары минут. Эту вкладку можно закрыть.`, true)
      : page('Не получилось', 'Ошибка: ' + (j.error || 'неизвестно') + '. Попробуй ещё раз по ссылке подключения.', false);
  }
  return page('ditrihh', 'Это сервер ditrihh.', true);
}

module.exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod === 'GET') {
    const tk = context && context.token && context.token.access_token;
    try { return await handleDaGet(event.queryStringParameters || {}, tk); }
    catch (e) { console.error(e); return page('Ошибка сервера', 'Попробуй ещё раз через минуту.', false); }
  }
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

  if (body.action === 'da_client') return reply(200, { client_id: process.env.DA_CLIENT_ID || null });
  if (body.action === 'donations' || body.action === 'da_connect') {
    try { return body.action === 'donations' ? await handleDonations(token) : await handleDaConnect(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  if (body.action === 'ratings' || body.action === 'rate') {
    try { return body.action === 'rate' ? await handleRate(body, token) : await handleRatings(token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  if (body.action === 'ping' || body.action === 'stats') {
    try { return await handleStats(body, token); } catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }
  if (body.action === 'comment_ok' || body.action === 'comment_ban') {
    try { return await handleCommentMod(body, token); } catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }
  if (body.action === 'bans' || body.action === 'unban') {
    try { return await handleBans(body, token); } catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }
  if (body.action === 'comments' || body.action === 'comment' || body.action === 'comment_del') {
    try { return body.action === 'comments' ? await handleComments(body, token) : body.action === 'comment' ? await handleComment(body, token) : await handleCommentDel(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  if (body.action === 'login_admin') {
    try { return await handleLoginAdmin(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'login' }); }
  }

  if (body.action === 'login_vk' || body.action === 'login_ya') {
    try { return body.action === 'login_vk' ? await handleLoginVk(body, token) : await handleLoginYa(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'login' }); }
  }

  if (body.action === 'claim') {
    try { return await handleClaim(body, token); }
    catch (e) { console.error(e); return reply(502, { error: 'storage' }); }
  }

  let user = verify(body.initData, process.env.BOT_TOKEN) || verify(body.initData, process.env.BOT_TOKEN_NEW);
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
