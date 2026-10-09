// Обложки песен и табов: covers/<id>.jpg, 1200×630 — для Дзена (лента dzen.xml) и превью ссылок (og:image).
// Рисует только недостающие или устаревшие (поменялись название, исполнитель, аккорды…) — отпечаток в covers/index.json.
//   node scripts/covers.mjs --check   → код выхода 1, если что-то нужно перерисовать (без Playwright)
//   node scripts/covers.mjs           → перерисовать (нужен пакет playwright с Chromium)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'covers');
const VERSION = 1;   // поменять, если поменялся дизайн обложки — перерисуются все
const songs = JSON.parse(fs.readFileSync(path.join(ROOT, 'songs.json'), 'utf8')).filter(s => /^[a-z0-9-]{1,80}$/.test(s.id || ''));
const chordsIn = t => [...new Set([...(t || '').matchAll(/\[([^\]]+)\]/g)].map(m => m[1].split('|')[0].trim()).filter(Boolean))];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const info = s => ({ v: VERSION, title: s.title, artist: s.artist || '', tab: !!s.tab, fs: !!s.fingerstyle, ex: !!s.exclusive, ch: s.tab ? [] : chordsIn(s.text).slice(0, 8) });
const hash = s => crypto.createHash('sha1').update(JSON.stringify(info(s))).digest('hex').slice(0, 12);
fs.mkdirSync(DIR, { recursive: true });
const idxFile = path.join(DIR, 'index.json');
const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : {};
const todo = songs.filter(s => idx[s.id] !== hash(s) || !fs.existsSync(path.join(DIR, s.id + '.jpg')));
// лишние обложки (песню удалили) — убираем
const ids = new Set(songs.map(s => s.id));
for (const f of fs.readdirSync(DIR)) if (f.endsWith('.jpg') && !ids.has(f.slice(0, -4))) { fs.rmSync(path.join(DIR, f)); delete idx[f.slice(0, -4)]; }

if (process.argv.includes('--check')) { console.log(todo.length ? `Обложек нарисовать: ${todo.length}` : 'Обложки в порядке'); process.exit(todo.length ? 1 : 0); }
if (!todo.length) { fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n'); console.log('Обложки в порядке'); process.exit(0); }

const font = f => 'file://' + path.join(ROOT, 'vendor/fonts', f);
const logo = fs.readFileSync(path.join(ROOT, 'brand/ditrihh-logo-white.svg'), 'utf8');
function html(s) {
  const i = info(s);
  const badges = [i.tab ? 'Таб со звуком' : 'Аккорды', i.fs ? 'Фингерстайл' : '', i.ex ? '★ Эксклюзив' : ''].filter(Boolean);
  const len = i.title.length, size = len > 34 ? 64 : len > 24 ? 78 : len > 16 ? 92 : 108;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Russo One';src:url(${font('russo-one-cyrillic-400-normal.woff2')});unicode-range:U+0400-045F}
@font-face{font-family:'Russo One';src:url(${font('russo-one-latin-400-normal.woff2')});unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:'Manrope';font-weight:800;src:url(${font('manrope-cyrillic-800-normal.woff2')});unicode-range:U+0400-045F}
@font-face{font-family:'Manrope';font-weight:800;src:url(${font('manrope-latin-800-normal.woff2')});unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:'Manrope';font-weight:700;src:url(${font('manrope-cyrillic-700-normal.woff2')});unicode-range:U+0400-045F}
@font-face{font-family:'Manrope';font-weight:700;src:url(${font('manrope-latin-700-normal.woff2')});unicode-range:U+0000-00FF,U+2000-206F}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;color:#EFECFB;font-family:Manrope,sans-serif;
  background:radial-gradient(800px 520px at 5% -10%,rgba(110,123,255,.45),transparent 60%),radial-gradient(700px 500px at 105% 10%,rgba(255,95,207,.28),transparent 60%),radial-gradient(900px 600px at 60% 120%,rgba(94,60,255,.35),transparent 60%),#0C0A24}
.w{position:absolute;inset:56px 64px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.logo{height:62px}.logo svg{height:62px;width:auto}
.badges{display:flex;gap:10px}
.b{font-weight:800;font-size:22px;padding:8px 16px;border-radius:12px;background:rgba(110,123,255,.22);box-shadow:inset 0 0 0 2px rgba(110,123,255,.45)}
.b.ex{background:rgba(240,168,48,.18);box-shadow:inset 0 0 0 2px rgba(240,168,48,.6);color:#F7C76A}
.mid{margin:auto 0}
h1{font-family:'Russo One',sans-serif;font-weight:400;font-size:${size}px;line-height:1.05;text-shadow:0 0 34px rgba(110,123,255,.55);max-width:1060px}
.by{margin-top:18px;font-weight:700;font-size:36px;color:#CFCCF2}
.ch{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.ch span{font-weight:800;font-size:30px;color:#1b1b1b;background:#F0A830;border-radius:12px;padding:6px 16px;box-shadow:0 5px 0 #b77a17}
.foot{display:flex;justify-content:space-between;align-items:flex-end;font-weight:800;font-size:28px;color:#A4A1D8}
.foot b{color:#EFECFB}
</style></head><body><div class="w">
<div class="top"><div class="logo">${logo}</div><div class="badges">${badges.map(b => `<span class="b${b.startsWith('★') ? ' ex' : ''}">${esc(b)}</span>`).join('')}</div></div>
<div class="mid"><h1>${esc(i.title)}</h1>${i.artist ? `<div class="by">${esc(i.artist)}</div>` : ''}
${i.ch.length ? `<div class="ch">${i.ch.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div>
<div class="foot"><span>${i.tab ? 'Слушай, замедляй и играй вместе' : 'Аккорды над слогами · схемы со звуком'}</span><b>ditrihh.ru</b></div>
</div></body></html>`;
}

const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const s of todo) {
  const tmp = path.join(DIR, '_render.html');
  fs.writeFileSync(tmp, html(s));
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  // длинное название не влезло — уменьшаем шрифт
  await page.evaluate(() => { const h = document.querySelector('h1'), w = document.querySelector('.w'); let f = parseFloat(getComputedStyle(h).fontSize);
    while (w.scrollHeight > w.clientHeight + 1 && f > 40) { f -= 4; h.style.fontSize = f + 'px'; } });
  await page.screenshot({ path: path.join(DIR, s.id + '.jpg'), type: 'jpeg', quality: 88 });
  fs.rmSync(tmp);
  idx[s.id] = hash(s);
  console.log('обложка:', s.id);
}
await browser.close();
fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n');
console.log(`Готово: обложек ${todo.length}`);
