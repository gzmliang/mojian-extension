# 墨笺 InkNote — Chrome Extension Markdown Reader

**Markdown 阅读器 Chrome 扩展，移植自 Android 版 [gzmliang/mojian](https://github.com/gzmliang/mojian)。**

支持 LaTeX 数学公式渲染（KaTeX）、Mermaid 图表、TTS 朗读（Edge TTS + Browser Speech）、AI 翻译（DeepSeek API）、高亮标注、书签、大纲导航、编辑模式、全文搜索，以及三种主题（亮色/暗色/护眼）。

![version](https://img.shields.io/badge/version-1.0.0-blue)
![chrome](https://img.shields.io/badge/chrome-mv3-green)

---

## 功能一览

| 功能 | 说明 |
|------|------|
| **Markdown 渲染** | marked.js 引擎，GFM + 自动换行，支持表格/代码块/块引用 |
| **LaTeX 数学公式** | KaTeX 渲染，行内 `$...$` 和块级 `$$...$$` |
| **Mermaid 图表** | 流程图、序列图、类图、状态图 |
| **TTS 朗读** | 优先 Edge TTS（微软云服务）→ 回退 Web Speech API，段落级高亮跟随 |
| **AI 翻译** | DeepSeek API（⚙️ 设置中配置 Key），选中文字即时翻译 |
| **高亮标注** | 选中文字 → 快捷工具栏 ⭐ 添加高亮，localStorage 持久化 |
| **书签** | 段落级书签，面板管理，点击跳转 + 高亮闪烁 |
| **全文搜索** | Ctrl+F，跨节点全文匹配，上下导航 |
| **大纲导航** | 侧边栏标题提取，点击跳转 |
| **主题切换** | Light / Dark / Sepia（亮色 / 暗色 / 护眼） |
| **字体缩放** | A− / A+ 按钮，8~36px |
| **编辑模式** | textarea 编辑器（MV3 限制无法加载 CodeMirror 6），编辑后可同步回阅读 |
| **全屏阅读** | Fullscreen API 全屏沉浸 |
| **导出** | HTML 下载 / Markdown 复制到剪贴板 |
| **打开方式** | 📂 本地文件 / 🔗 URL 链接 / 🖱 拖拽 .md 文件 / 右键菜单 |
| **调试日志** | 🐛 底部可折叠日志面板，📋 一键复制 |
| **快捷键** | `Ctrl+F` 搜索 / `j↓` `k↑` 翻页 / `Esc` 关闭 |

---

## 安装

### 1. 下载

从 [Releases](https://github.com/gzmliang/mojian-extension/releases) 下载最新 ZIP。

### 2. 加载扩展

1. 解压 ZIP 到任意文件夹
2. Chrome 打开 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展**
5. 选择解压后的文件夹

### 3. 使用

- **方式一** — 点击扩展工具栏的墨笺图标，打开阅读器
- **方式二** — 右键网页上的 `.md` 链接 → **用墨笺打开**
- **方式三** — 右键选中文字 → **用墨笺打开选中内容**
- **方式四** — 拖拽 `.md` 文件到阅读器窗口

---

## 配置

打开阅读器后，点击右上角 ⚙️ 设置：

### 翻译 API

| 设置 | 说明 | 默认值 |
|------|------|--------|
| API 端点 | OpenAI 兼容的 API 地址 | `https://api.deepseek.com/v1/chat/completions` |
| API Key | 你的 API 密钥 | — |
| 模型 | 模型名称 | `deepseek-chat` |

### Edge TTS

| 设置 | 说明 | 默认值 |
|------|------|--------|
| 服务器地址 | Edge TTS 服务地址 | `http://powerplus.blogsyte.com:5001` |
| 语音 | TTS 语音选择 | `zh-CN-XiaoxiaoNeural` |

> 如果 Edge TTS 服务不可用，自动回退到浏览器内置的 Web Speech API。

---

## 项目结构

```
mojian-extension/
├── manifest.json          # Chrome MV3 扩展清单
├── background.js          # Service Worker (右键菜单 + 图标点击)
├── reader.html            # 主阅读页面
├── reader.js              # 完整应用逻辑 (~1100 行)
├── styles.css             # 三主题样式 (Light / Dark / Sepia)
├── lib/                   # 本地依赖 (MV3 限制不可用 CDN)
│   ├── marked.min.js      # Markdown 解析引擎
│   ├── katex.min.css      # KaTeX 样式
│   ├── katex.min.js       # KaTeX 数学渲染
│   ├── auto-render.min.js # KaTeX 自动渲染
│   └── mermaid.min.js     # Mermaid 图表渲染
├── icons/                 # 扩展图标 (16/48/128)
├── build.sh               # 打包脚本
└── README.md
```

---

## 构建

```bash
# 打包为 Chrome 扩展 ZIP
bash build.sh

# 输出到 /root/inknote-v*.zip
# 加载目录: /tmp/inknote-build-v*/
```

---

## 开发说明

### Chrome MV3 限制

1. **禁止 CDN** — 扩展页 CSP 默认只允许 `'self'`，所有 JS 库必须本地打包到 `lib/`
2. **禁止 `unsafe-eval`** — MV3 不允许在 `extension_pages` CSP 中使用 `unsafe-eval`，Mermaid 使用 `securityLevel: 'strict'` 模式
3. **禁止动态 ESM import** — 无法加载 CodeMirror 6（依赖 ESM import），使用 textarea 回退
4. **Service Worker** — 使用 `background.js` 处理扩展图标点击和右键菜单，不依赖持久页面

### 校对原则

- 所有 UI 文本使用中文
- 尊重原有代码风格，不做非必要重构
- 版本未测试通过不推送

---

## 版本历史

| 版本 | 日期 | 要点 |
|:---|:---|:---|
| v1.0.0 | 2026-06 | 🎯 首个发布版 · 完整功能移植自 Android 墨笺 |

---

## 许可

MIT License

## 关联项目

- [gzmliang/mojian](https://github.com/gzmliang/mojian) — Android 版墨笺 (Kotlin + Compose + WebView)
- [gzmliang/moreader](https://github.com/gzmliang/moreader) — 墨阅浏览器扩展 (EPUB 阅读器)
