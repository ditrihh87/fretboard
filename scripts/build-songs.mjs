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

const chordsIn = t => [...new Set([...(t || '').matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim()).filter(Boolean))];

// текст песни в простом HTML: его сразу видит поисковик, а в браузере страницу перерисовывает скрипт
function staticBody(s) {
  let body = '';
  for (const line of String(s.text || '').split('\n')) {
    const cm = line.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);
    if (cm) { body += `<h2>${esc(cm[1])}</h2>\n`; continue; }
    if (/^\s*\{.*\}\s*$/.test(line)) continue;
    const html = esc(line).replace(/\[([^\]]+)\]/g, (_, c) => `<b>${c}</b>`);
    body += `<p>${html || '&nbsp;'}</p>\n`;
  }
  return body;
}

function page(s) {
  const kind = s.tab ? 'tab' : 'chords';
  const url = `${SITE}${DIRS[kind]}/${s.id}.html`;
  const who = s.artist ? ` (${s.artist})` : '';
  const title = s.tab
    ? `${s.title}${who} — ${s.fingerstyle ? 'фингерстайл таб' : 'таб'} и аранжировка | ditrihh`
    : `${s.title}${who} — аккорды | ditrihh`;
  const ch = chordsIn(s.text);
  const desc = s.tab
    ? `${s.title}${who}: эксклюзивный ${s.fingerstyle ? 'фингерстайл-таб (аранжировка для одной гитары)' : 'таб'} от ditrihh со звуком, замедлением и повтором участка.`
    : `Правильные аккорды к песне «${s.title}»${who}${ch.length ? ': ' + ch.slice(0, 6).join(', ') : ''}. Подобраны и проверены на гитаре, схемы со звуком, смена тональности.`;
  const aka = Array.isArray(s.aka) ? s.aka.filter(Boolean) : [];
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
  swap(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(descFull)}">${aka.length ? `\n<meta name="keywords" content="${esc([s.title, s.artist, ...aka].filter(Boolean).join(', '))}">` : ''}\n<meta property="og:description" content="${esc(desc)}">`);
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
