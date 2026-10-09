// Сборка страниц песен для поисковиков.
// Из songs.json и шаблона song.html делает постоянную страницу на каждую песню:
//   akkordy/<id>.html — аккорды, taby/<id>.html — табы,
// и sitemap.xml со всеми страницами сайта.
// Запускается автоматически на GitHub (.github/workflows/build-songs.yml) при каждом изменении songs.json.
// Вручную: node scripts/build-songs.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://ditrihh.ru/';
const DIRS = { chords: 'akkordy', tab: 'taby' };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id);

const songs = JSON.parse(fs.readFileSync(path.join(ROOT, 'songs.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(ROOT, 'song.html'), 'utf8');

const credits = s => [
  s.words && s.words === s.music ? 'Слова и музыка: ' + s.words : '',
  s.words && s.words !== s.music ? 'Слова: ' + s.words : '',
  s.music && s.words !== s.music ? 'Музыка: ' + s.music : '',
].filter(Boolean);

const chordsIn = t => [...new Set([...(t || '').matchAll(/\[([^\]]+)\]/g)].map(m => m[1].split('|')[0].trim()).filter(Boolean))];

/* «Также ищут» сами: первая строчка первого куплета и первая строчка припева (если он есть) —
   песню часто ищут не по названию, а по словам. Добавляются к aka из songs.json. */
const cleanLine = l => l.replace(/\[[^\]]*\]/g, '').replace(/\(\(|\)\)/g, '').replace(/\s+/g, ' ').trim().replace(/[\s,.;:!?…—–-]+$/, '');
function firstLines(text) {
  const secs = []; let cur = { head: '', lines: [] };
  for (const line of String(text || '').split('\n')) {
    const cm = line.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);
    if (cm) { secs.push(cur); cur = { head: cm[1], lines: [] }; continue; }
    if (/^\s*\{.*\}\s*$/.test(line)) continue;
    const t = cleanLine(line);
    if (/[а-яёa-z]{2}/i.test(t)) cur.lines.push(t);
  }
  secs.push(cur);
  const withText = secs.filter(x => x.lines.length);
  const NOT_VERSE = /вступл|интро|проигр|соло|бридж|кода|финал|аутро|припев/i;
  const verse = withText.find(x => /куплет/i.test(x.head) || !x.head.trim()) ||   // текст до первого заголовка — тоже первый куплет
    withText.find(x => !NOT_VERSE.test(x.head));
  const chorus = withText.find(x => /припев/i.test(x.head));
  return [verse && verse.lines[0], chorus && chorus.lines[0]].filter(Boolean);
}
function akaOf(s) {
  const seen = new Set([String(s.title || '').toLowerCase()]), out = [];
  for (const a of [...(Array.isArray(s.aka) ? s.aka : []), ...(s.tab ? [] : firstLines(s.text))]) {
    const k = String(a || '').trim(); if (!k || seen.has(k.toLowerCase())) continue; seen.add(k.toLowerCase()); out.push(k);
  }
  return out;
}

// текст песни в простом HTML: его сразу видит поисковик, а в браузере страницу перерисовывает скрипт
function staticBody(s) {
  let body = '';
  let it = false;
  for (const line of String(s.text || '').split('\n')) {
    const cm = line.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);
    if (cm) { body += `<h2>${esc(cm[1])}</h2>\n`; continue; }
    if (/^\s*\{.*\}\s*$/.test(line)) continue;
    // ((текст)) — курсив
    const html = line.split(/(\(\(|\)\))/).map(p => p === '((' ? (it = true, '') : p === '))' ? (it = false, '') : p ? (it ? '<i>' + esc(p) + '</i>' : esc(p)) : '').join('')
      .replace(/\[([^\]]+)\]/g, (_, c) => `<b>${c.split('|')[0]}</b>`);
    body += `<p>${html || '&nbsp;'}</p>\n`;
  }
  return body;
}

/* «Простые аккорды» — так же, как на странице песни: easyFrom из songs.json или перенос в Am/Em/C/G с каподастром.
   Попадают в описание для поисковиков («… простые аккорды», «аккорды для начинающих»). */
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
const SHARP = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const parseChord = n => { const m = String(n).trim().match(/^([A-H])([#b]?)(.*)$/); return m ? { pc: (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, q: m[3] } : null; };
const tr = (n, st) => st ? n.split('/').map(p => { const c = parseChord(p); return c ? SHARP[(c.pc + st + 120) % 12] + c.q : p; }).join('/') : n;
const EASY = new Set(['C', 'D', 'E', 'G', 'A', 'Am', 'Dm', 'Em', 'A7', 'B7', 'C7', 'D7', 'E7', 'G7', 'Am7', 'Dm7', 'Em7', 'Cmaj7', 'Gmaj7', 'Asus2', 'Asus4', 'Dsus2', 'Dsus4', 'Esus4']);
function easyOf(s, ch) {
  const f = ch.map(parseChord).find(Boolean); if (!f) return null;
  if (s.easy === 'same') return { k: 0, same: true, chords: [...new Set(ch.map(c => c.replace(/^([A-H][#b]?)(m)?(maj7|7)(?=\/|$)/, '$1$2')))] };
  let k;
  const ef = s.easyFrom && parseChord(s.easyFrom);
  if (ef) k = (f.pc - ef.pc + 12) % 12;
  else {
    const minor = /^m(?!aj)/.test(f.q); let best = null;
    (minor ? [9, 4] : [0, 7]).forEach(tg => { const kk = (f.pc - tg + 12) % 12;
      const hard = ch.filter(c => !EASY.has(tr(c.split('/')[0], -kk).replace(/^Bb/, 'A#'))).length;
      if (!best || hard < best.hard || (hard === best.hard && kk < best.k)) best = { k: kk, hard }; });
    k = best.k;
  }
  const easy = [...new Set(ch.map(c => tr(c, -k)))];
  return easy.join() === ch.join() ? null : { k, chords: easy };
}

const coverOf = s => fs.existsSync(path.join(ROOT, 'covers', s.id + '.jpg')) ? `${SITE}covers/${s.id}.jpg` : '';

function page(s) {
  const kind = s.tab ? 'tab' : 'chords';
  const url = `${SITE}${DIRS[kind]}/${s.id}.html`;
  // если в названии уже есть скобки — исполнителя в заголовок не дописываем, чтобы главное влезло в выдачу
  const who = s.artist && !/\)\s*$/.test(s.title) ? ` (${s.artist})` : '';
  const title = s.tab
    ? `${s.title}${who} — ${s.fingerstyle ? 'фингерстайл таб (fingerstyle)' : 'таб и аранжировка'} | ditrihh`
    : `${s.title}${who} — аккорды | ditrihh`;
  const ch = chordsIn(s.text);
  const desc = s.tab
    ? `${s.title}${who}: эксклюзивный ${s.fingerstyle ? 'фингерстайл-таб (fingerstyle guitar, аранжировка для одной гитары)' : 'таб'} от ditrihh со звуком, замедлением и повтором участка.`
    : (() => { const ez = easyOf(s, ch);
        return `Правильные аккорды к песне «${s.title}»${who}${ch.length ? ': ' + ch.slice(0, 6).join(', ') : ''}. ` +
          (ez ? `Простые аккорды для начинающих: ${ez.chords.slice(0, 5).join(', ')}${ez.k ? ` (каподастр на ${ez.k} лад)` : ez.same ? ' — в той же тональности, на открытых струнах' : ''}. ` : s.shapes && Object.keys(s.shapes).length ? 'Простые аккорды для начинающих — на открытых струнах, без баре. ' : '') +
          'Подобраны и проверены на гитаре, схемы со звуком.'; })();
  const aka = akaOf(s);
  const descFull = aka.length ? `${desc} Также ищут: ${aka.join(', ')}.` : desc;
  const ld = {
    '@context': 'https://schema.org', '@type': 'MusicComposition', name: s.title,
    ...(s.artist ? { byArtist: { '@type': 'MusicGroup', name: s.artist } } : {}),
    ...(s.words ? { lyricist: { '@type': 'Person', name: s.words } } : {}),
    ...(aka.length ? { alternateName: aka } : {}),
    url,
  };
  const pre = `<div class="crumbs"><a href="songs.html?type=${kind}">${s.tab ? '← Все табы' : '← Все аккорды'}</a></div>
<article class="seo"><h1>${esc(s.title)}${s.tab ? ' — таб' : ' — аккорды'}</h1>
<p class="by">${esc(s.artist || '')}</p>${credits(s).map(c => `<p class="credits">${esc(c)}</p>`).join('')}
${s.tab ? '<p>Таб со звуком: слушай, замедляй и играй вместе с ним.</p>' : staticBody(s)}</article>`;

  let html = tpl;
  const swap = (re, rep) => { if (!re.test(html)) throw new Error('шаблон song.html изменился: ' + re); html = html.replace(re, rep); };
  // все относительные адреса (стили, скрипты, songs.json, табы) — от корня сайта
  swap(/<head>/, `<head>\n<base href="../">`);
  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n<link rel="canonical" href="${url}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:url" content="${url}">\n<meta property="og:image" content="${coverOf(s) || SITE + 'brand/ditrihh-logo-dark.png'}">\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n<script>window.SONG_ID=${JSON.stringify(s.id)};</script>`);
  swap(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(descFull)}">${aka.length ? `\n<meta name="keywords" content="${esc([s.title, s.artist, ...aka].filter(Boolean).map(k => k.replace(/,/g, '')).join(', '))}">` : ''}\n<meta property="og:description" content="${esc(desc)}">`);
  swap(/<div id="content">[\s\S]*?<\/div>\n/, `<div id="content">${pre}</div>\n`);
  return { file: path.join(ROOT, DIRS[kind], s.id + '.html'), url, html };
}

// страницы песен — папки целиком принадлежат сборке, лишнее удаляем
for (const d of Object.values(DIRS)) {
  fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, d))) if (f.endsWith('.html')) fs.rmSync(path.join(ROOT, d, f));
}
const pages = [];
for (const s of songs) {
  if (!okId(s.id)) { console.warn('пропускаю песню с плохим id:', s.id); continue; }
  const p = page(s);
  fs.writeFileSync(p.file, p.html);
  pages.push(p.url);
}

// sitemap.xml
const today = new Date().toISOString().slice(0, 10);
const urls = [SITE, `${SITE}songs.html?type=chords`, `${SITE}songs.html?type=tab`, `${SITE}songs.html?type=tab&f=fs`, ...pages];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + `\n</urlset>\n`);

console.log(`Готово: ${pages.length} стр. песен, sitemap — ${urls.length} адресов.`);

/* ===== Лента для Дзена: dzen.xml =====
   Дзен забирает новые записи сам (Студия → Настройки → Свой сайт → Транслировать материалы).
   В пост идёт не весь текст песни, а анонс: обложка, аккорды, простые аккорды, первые строчки и ссылка на сайт —
   полные тексты принадлежат правообладателям, а копия на Дзене не должна обгонять сайт в поиске.
   Дата публикации — слот в очереди (feed-dates.json): не больше 3 постов в день, 10:00 / 15:00 / 20:00 МСК. */
const DZEN_MODE = 'draft';   // 'draft' — приходят черновиками (проверить и опубликовать руками), 'publish' — сразу на канал
const datesFile = path.join(ROOT, 'feed-dates.json');
const dates = fs.existsSync(datesFile) ? JSON.parse(fs.readFileSync(datesFile, 'utf8')) : {};
// очередь: в Дзен выходит не больше 3 постов в день — в 10:00, 15:00 и 20:00 по Москве.
// Новая песня встаёт в ближайший свободный слот (не раньше чем через час — так требует Дзен для отложенной публикации).
const SLOTS_UTC = [7, 12, 17];
const taken = new Set(Object.values(dates));
function nextSlot() {
  const min = Date.now() + 65 * 60e3, d = new Date(); d.setUTCHours(0, 0, 0, 0);
  for (;;) {
    for (const h of SLOTS_UTC) { const t = new Date(d.getTime() + h * 3600e3); if (t.getTime() >= min && !taken.has(t.toISOString())) { taken.add(t.toISOString()); return t.toISOString(); } }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
for (const s of songs) if (okId(s.id) && !dates[s.id]) dates[s.id] = nextSlot();
for (const id of Object.keys(dates)) if (!songs.some(s => s.id === id)) delete dates[id];
fs.writeFileSync(datesFile, JSON.stringify(dates, null, 1) + '\n');

const rfc822 = iso => { const d = new Date(new Date(iso).getTime() + 3 * 3600e3);   // по Москве
  const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], p = n => String(n).padStart(2, '0');
  return `${D[d.getUTCDay()]}, ${p(d.getUTCDate())} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0300`; };
const cdata = h => '<![CDATA[' + h.replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';

function dzenItem(s) {
  const url = `${SITE}${s.tab ? DIRS.tab : DIRS.chords}/${s.id}.html`, cover = coverOf(s);
  const who = s.artist ? ` — ${s.artist}` : '';
  const P = [];
  if (cover) P.push(`<figure><img src="${cover}"><figcaption>${esc(s.title)}${esc(who)}</figcaption></figure>`);
  if (s.tab) {
    P.push(`<p>${s.fingerstyle ? 'Fingerstyle-аранжировка' : 'Таб'} «${esc(s.title)}»${esc(who)} для одной гитары: мелодия, бас и аккомпанемент сразу.${s.exclusive ? ' Моя аранжировка — такого таба больше нигде нет.' : ''}</p>`);
    P.push(`<p>Таб со звуком: можно слушать, замедлять до 50%, повторять трудное место по кругу и играть вместе с ним. Есть метроном и отсчёт перед началом.</p>`);
  } else {
    const ch = chordsIn(s.text), ez = easyOf(s, ch), lines = firstLines(s.text);
    P.push(`<p>Правильные аккорды к песне «${esc(s.title)}»${esc(who)} — подобраны и проверены на гитаре.${credits(s).length ? ' ' + esc(credits(s).join('. ')) + '.' : ''}</p>`);
    if (ch.length) P.push(`<p><b>Аккорды:</b> ${esc(ch.join(', '))}</p>`);
    if (ez) P.push(`<p><b>Простые аккорды для начинающих:</b> ${esc(ez.chords.join(', '))}${ez.k ? ` — с каподастром на ${ez.k} ладу` : ' — в той же тональности, на открытых струнах'}.</p>`);
    else if (s.shapes && Object.keys(s.shapes).length) P.push(`<p>Есть простая версия — те же аккорды на открытых струнах, без баре.</p>`);
    if (lines[0]) P.push(`<p>Начинается так: «${esc(lines[0])}…»${lines[1] ? ` Припев: «${esc(lines[1])}…»` : ''}</p>`);
    P.push(`<p>Полный текст с аккордами над слогами, схемы аккордов со звуком, транспонирование и простая версия — на сайте.</p>`);
  }
  P.push(`<p><a href="${url}">${s.tab ? 'Открыть таб со звуком' : 'Аккорды и текст полностью'} на ditrihh.ru →</a></p>`);
  P.push(`<p>Каждый день играю на гитаре в прямом эфире на Twitch и YouTube — заходи, разберём твою песню.</p>`);
  const cat = [DZEN_MODE === 'draft' ? 'native-draft' : '', 'format-article', 'index', 'comment-all'].filter(Boolean);
  const title = s.tab ? `${s.title}${who}: ${s.fingerstyle ? 'фингерстайл таб' : 'таб'} со звуком` : `${s.title}${who}: аккорды для гитары`;
  return `  <item>
    <title>${esc(title)}</title>
    <link>${url}</link>
    <pdalink>${url}</pdalink>
    <guid>${url}</guid>
    <pubDate>${rfc822(dates[s.id])}</pubDate>
    <media:rating scheme="urn:simple">nonadult</media:rating>
${cat.map(c => `    <category>${c}</category>`).join('\n')}
${cover ? `    <enclosure url="${cover}" type="image/jpeg"/>\n` : ''}    <description>${esc(title)}</description>
    <content:encoded>${cdata(`<h1>${esc(title)}</h1>` + P.join(''))}</content:encoded>
  </item>`;
}
// в ленте: вышедшие за последние 3 дня и запланированные на 2 дня вперёд (сборка идёт каждый день — очередь подтягивается);
// если вышло меньше 10 — добираем последними вышедшими (Дзену нужно не меньше 10 записей)
const all = songs.filter(s => okId(s.id)).sort((a, b) => dates[b.id].localeCompare(dates[a.id]));
const now = Date.now(), at = s => Date.parse(dates[s.id]);
const ahead = all.filter(s => at(s) > now && at(s) <= now + 2 * 864e5);
let past = all.filter(s => at(s) <= now && at(s) >= now - 3 * 864e5);
if (past.length < 10) past = all.filter(s => at(s) <= now).slice(0, 10);
const feed = [...ahead, ...past];
const queued = all.filter(s => at(s) > now).length;
fs.writeFileSync(path.join(ROOT, 'dzen.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:georss="http://www.georss.org/georss">
<channel>
  <title>ditrihh — аккорды и табы</title>
  <link>${SITE}</link>
  <language>ru</language>
${feed.map(dzenItem).join('\n')}
</channel>
</rss>
`);
console.log(`Дзен: в ленте ${feed.length} записей, в очереди ${queued} (${DZEN_MODE === 'draft' ? 'черновики' : 'публикация по расписанию'}).`);

/* ===== Посты для ВК: vk-posts.json → страница vk-posts.html (видна владельцу) =====
   ВК не принимает RSS и не даёт постить на стену сообщества по API без особого доступа,
   поэтому готовим текст и обложку — останется вставить и поставить отложенную запись. */
const tagOf = t => '#' + String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
function vkText(s) {
  const url = `${SITE}${s.tab ? DIRS.tab : DIRS.chords}/${s.id}.html`, who = s.artist ? ` — ${s.artist}` : '';
  const L = [];
  if (s.tab) {
    L.push(`🎸 ${s.title}${who}: ${s.fingerstyle ? 'фингерстайл таб' : 'таб'} со звуком`, '');
    L.push(`${s.fingerstyle ? 'Аранжировка для одной гитары: мелодия, бас и аккомпанемент сразу.' : 'Таб для гитары.'}${s.exclusive ? ' Моя аранжировка — такого таба больше нигде нет.' : ''}`);
    L.push('Таб можно слушать, замедлять до 50% и повторять трудное место по кругу.', '');
    L.push('Открыть таб 👇', url);
  } else {
    const ch = chordsIn(s.text), ez = easyOf(s, ch), lines = firstLines(s.text);
    L.push(`🎸 ${s.title}${who}: аккорды для гитары`, '');
    if (ch.length) L.push(`Аккорды: ${ch.join(', ')}`);
    if (ez) L.push(`🔰 Простые аккорды для начинающих: ${ez.chords.join(', ')}${ez.k ? ` — с каподастром на ${ez.k} ладу` : ' — без баре'}`);
    else if (s.shapes && Object.keys(s.shapes).length) L.push('🔰 Есть простая версия — на открытых струнах, без баре');
    if (lines[0]) L.push('', `Начинается так: «${lines[0]}…»`);
    if (lines[1]) L.push(`Припев: «${lines[1]}…»`);
    L.push('', 'Полный текст с аккордами над слогами, схемы со звуком и простая версия 👇', url);
  }
  L.push('', [s.tab ? '#табы' : '#аккорды', '#гитара', s.artist && s.artist.length <= 24 && !/[()]/.test(s.artist) ? tagOf(s.artist) : '', s.fingerstyle ? '#фингерстайл' : '', '#ditrihh'].filter(t => t && t.length > 2).join(' '));
  return L.join('\n');
}
const vk = songs.filter(s => okId(s.id)).sort((a, b) => dates[b.id].localeCompare(dates[a.id])).slice(0, 80).map(s => ({
  id: s.id, title: s.title, artist: s.artist || '', tab: !!s.tab, at: dates[s.id],
  url: `${SITE}${s.tab ? DIRS.tab : DIRS.chords}/${s.id}.html`, cover: coverOf(s) ? `covers/${s.id}.jpg` : '', text: vkText(s),
}));
fs.writeFileSync(path.join(ROOT, 'vk-posts.json'), JSON.stringify(vk, null, 1) + '\n');
