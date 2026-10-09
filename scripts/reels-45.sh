#!/usr/bin/env bash
# Рилсы 9:16 → 4:5 (720×900) для сайта: вырезает кадр с текстом и руками, сжимает для веба.
# Использование:  bash scripts/reels-45.sh ПАПКА_С_РИЛСАМИ [ПАПКА_ДЛЯ_ГОТОВЫХ]
# Нужен ffmpeg. Уже готовые файлы пропускает — можно запускать повторно, когда добавились новые ролики.
# TOP — где начинается кадр (доля высоты сверху). 0.117 подобрано под съёмку с одной точки: текст песни + гриф + обе руки.
set -euo pipefail
IN="${1:?папка с рилсами}"; OUT="${2:-$IN/4x5}"; TOP="${TOP:-0.117}"
mkdir -p "$OUT"
shopt -s nullglob nocaseglob
n=0
for f in "$IN"/*.mp4 "$IN"/*.mov; do
  out="$OUT/$(basename "${f%.*}").mp4"
  [ -s "$out" ] && continue
  echo "→ $(basename "$f")"
  ffmpeg -v error -y -i "$f" \
    -vf "crop=iw:trunc(iw*5/4/2)*2:0:trunc(ih*$TOP/2)*2,scale=720:900" \
    -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p \
    -c:a aac -b:a 128k -movflags +faststart "$out"
  n=$((n+1))
done
echo "Готово: $n новых в $OUT"
