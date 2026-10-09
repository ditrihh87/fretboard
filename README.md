# ditrihh

Гитарный клуб в Telegram: уроки, тренажёры, лиги и песенник (ноты на грифе, аккорды, интервалы, тренажёр слуха) — Mini App [@ditrihh_bot](https://t.me/ditrihh_bot?startapp).

- `index.html` — главная страница сайта (из Telegram сразу открывает приложение)
- `school/index.html` (адрес ditrihh.ru/school/; `app.html` — переадресация для старых ссылок и Telegram) — приложение: школа, тренажёры, песенник, таб-плеер (GitHub Pages: https://ditrihh87.github.io/fretboard/)
- `songs.json` — песни для песенника (как добавлять: SONGS.md)
- `samples/` — звуки гитары
- `server/index.js` — сервер рейтинга недели (Yandex Cloud Functions)

## Звуки

Семплы гитары взяты из [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)
(лицензия семплов — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)), обрезаны, выровнены по громкости и пережаты:

- `samples/acoustic` — University of Iowa Electronic Music Studios (Musical Instrument Samples)
- `samples/electric` — Karoryfer Samples
- `samples/nylon` — quartertone, Freesound: classicalguitar-multisampled (11573)

## Таб-плеер

Плеер табов Guitar Pro работает на [alphaTab](https://www.alphatab.net/) (MPL-2.0), файлы библиотеки без изменений лежат в `vendor/alphatab/`:
- шрифт нот Bravura — SIL Open Font License (`vendor/alphatab/font/Bravura-OFL.txt`);
- звуковой банк Sonivox — Apache License 2.0 (`vendor/alphatab/soundfont/LICENSE`).

Табы лежат в папке `tabs/` (форматы .gp, .gp3–.gp5, .gpx, MusicXML или alphaTex .atex) и подключаются в `songs.json` полем `"tab": "tabs/имя-файла.gp"`.
