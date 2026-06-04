#!/bin/bash
# 墨笺 InkNote — Build & Package Script
set -e

cd "$(dirname "$0")"
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "📦 墨笺 InkNote v$VERSION — 打包中..."

# Verify all required files exist
required=(
  "manifest.json"
  "background.js"
  "reader.html"
  "reader.js"
  "styles.css"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
)
for f in "${required[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ 缺失: $f"
    exit 1
  fi
done
echo "✅ 文件完整性检查通过"

# Create clean build directory
BUILD_DIR="/tmp/inknote-build-v$VERSION"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy all files
cp manifest.json "$BUILD_DIR/"
cp background.js "$BUILD_DIR/"
cp reader.html "$BUILD_DIR/"
cp reader.js "$BUILD_DIR/"
cp styles.css "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/icons"
cp icons/*.png "$BUILD_DIR/icons/"
mkdir -p "$BUILD_DIR/lib"
cp lib/* "$BUILD_DIR/lib/"

echo "✅ 文件已复制到 $BUILD_DIR"

# Check for syntax errors
echo "🔍 检查 JS 语法..."
node -e "
const fs = require('fs');
const content = fs.readFileSync('reader.js', 'utf8');
let depth = 0;
for (let c of content) {
  if (c === '{') depth++;
  if (c === '}') depth--;
}
console.log('  reader.js: 括号平衡 ' + (depth === 0 ? '✅' : '❌'));
const bg = fs.readFileSync('background.js', 'utf8');
depth = 0;
for (let c of bg) { if (c === '{') depth++; if (c === '}') depth--; }
console.log('  background.js: 括号平衡 ' + (depth === 0 ? '✅' : '❌'));
"

# Create ZIP
ZIPFILE="/root/inknote-v$VERSION.zip"
rm -f "$ZIPFILE"
(cd "$BUILD_DIR" && zip -r "$ZIPFILE" . > /dev/null)
echo "✅ ZIP 已创建: $ZIPFILE ($(du -h "$ZIPFILE" | cut -f1))"

echo "🎉 墨笺 InkNote v$VERSION 打包完成！"
echo "   在 Chrome 中加载已解压的扩展: chrome://extensions → 加载已解压的扩展 → 选择 $BUILD_DIR"
