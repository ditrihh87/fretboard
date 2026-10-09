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
  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>\n<link rel="canonical" href="${url}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:url" content="${url}">\n<meta property="og:image" content="${SITE}brand/ditrihh-logo-dark.png">\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n<script>window.SONG_ID=${JSON.stringify(s.id)};</script>`);
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
