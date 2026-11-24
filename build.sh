#!/bin/sh
# Build docs/ (served by GitHub Pages): index.html with inlined CSS/JS, plus data.json.
set -e
cd "$(dirname "$0")"
OUT=docs/index.html
mkdir -p docs
{
  cat <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gridiron GM</title>
<meta name="description" content="Gridiron GM: a pro football franchise sim with real rosters and contracts.">
<meta name="theme-color" content="#04070d">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 36%27%3E%3Cpath d=%27M16 0L32 4.7V22.7L16 36L0 22.7V4.7Z%27 fill=%27%23d4941a%27/%3E%3Ctext x=%2716%27 y=%2722%27 font-family=%27Arial%27 font-weight=%27900%27 font-size=%2714%27 text-anchor=%27middle%27 fill=%27%232a1800%27%3EGM%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,600;1,700;1,800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js"></script>
<style>
HEAD
  cat src/style.css
  echo '</style>'
  echo '</head>'
  echo '<body>'
  cat src/body.html
  echo '<script>'
  for f in src/js/*.js; do sed '/^if (typeof module/d' "$f"; echo; done
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > "$OUT"
cp src/data.json docs/data.json
touch docs/.nojekyll
echo "built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes) + docs/data.json"
