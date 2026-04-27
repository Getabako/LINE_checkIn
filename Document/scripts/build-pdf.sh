#!/bin/bash
# Document/*.md を PDF に変換するスクリプト
#
# 依存:
#   - pandoc            ( brew install pandoc )
#   - Google Chrome     ( headless で HTML → PDF )
#
# 使い方:
#   cd LINEMiniApp/gym-checkin
#   bash Document/scripts/build-pdf.sh
#
# 出力: Document/pdf/*.pdf

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/pdf"
TMP_DIR="$ROOT_DIR/.tmp_html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$OUT_DIR" "$TMP_DIR"

cat > "$TMP_DIR/style.css" <<'CSS'
@page { size: A4; margin: 18mm 16mm; }
html, body {
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN",
               "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif;
  font-size: 10.5pt;
  line-height: 1.65;
  color: #1f2937;
}
h1 { font-size: 18pt; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 1.2em; }
h2 { font-size: 14pt; border-bottom: 1px solid #93c5fd; padding-bottom: 4px; margin-top: 1.5em; }
h3 { font-size: 12pt; margin-top: 1.3em; }
h4 { font-size: 11pt; }
code, pre {
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 9pt;
}
pre {
  background: #f3f4f6;
  padding: 10px 12px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
code { background: #eef2ff; padding: 1px 4px; border-radius: 3px; }
pre code { background: transparent; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; }
th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
th { background: #f3f4f6; text-align: left; }
blockquote {
  margin: 8px 0; padding: 6px 12px;
  border-left: 4px solid #60a5fa;
  background: #eff6ff; color: #1e3a8a;
}
.mermaid { text-align: center; margin: 12px 0; }
a { color: #2563eb; word-break: break-all; }
img { max-width: 100%; }
CSS

HEADER_HTML=$(cat <<'HDR'
<meta charset="utf-8">
<link rel="stylesheet" href="style.css">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    // pandoc はフェンス言語 "mermaid" を <pre class="mermaid"><code>...</code></pre> の
    // 形で出すので、mermaid が認識できるよう <div class="mermaid">...</div> に置換する。
    document.querySelectorAll('pre.mermaid > code').forEach((code) => {
      const pre = code.parentElement;
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = code.textContent;
      pre.replaceWith(div);
    });
    mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
    mermaid.run();
    // Chrome headless が --virtual-time-budget で確実に待てるようにフラグ
    setTimeout(() => { document.body.dataset.ready = '1'; }, 1500);
  });
</script>
HDR
)

echo "$HEADER_HTML" > "$TMP_DIR/header.html"

shopt -s nullglob
FILES=( "$ROOT_DIR"/*.md )
echo "[info] 対象: ${#FILES[@]} ファイル"

for md in "${FILES[@]}"; do
  base="$(basename "$md" .md)"
  html="$TMP_DIR/$base.html"
  pdf="$OUT_DIR/$base.pdf"

  echo "[info] build: $base"

  pandoc "$md" \
    --from gfm \
    --to html5 \
    --standalone \
    --metadata "title=$base" \
    --include-in-header "$TMP_DIR/header.html" \
    --output "$html"

  # Chrome headless で PDF 化。virtual-time-budget で Mermaid 描画完了を待つ。
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --no-pdf-header-footer \
    --virtual-time-budget=8000 \
    --run-all-compositor-stages-before-draw \
    --print-to-pdf="$pdf" \
    "file://$html" 2>/dev/null
done

echo "[done] 出力先: $OUT_DIR"
ls -l "$OUT_DIR"
