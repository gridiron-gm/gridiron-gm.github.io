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
<title>NFL GM</title>
<meta name="description" content="NFL franchise GM sim with real rosters and contracts.">
<meta name="theme-color" content="#0e131a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
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
