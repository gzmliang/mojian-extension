# 隐私政策 / Privacy Policy

**更新日期 / Last Updated:** 2026-06-05

## 中文版

### 概述

墨笺 InkNote（以下简称"本扩展"）是一款 Chrome 浏览器扩展，用于 Markdown 文档的阅读与编辑。本扩展高度重视用户隐私，承诺不收集、不存储、不传输任何个人身份信息。

### 数据收集

本扩展 **不收集** 任何个人数据，包括但不限于：

- 不收集浏览历史
- 不收集搜索记录
- 不收集表单数据
- 不收集 Cookie
- 不收集设备信息（IP 地址、操作系统、浏览器版本等）
- 不收集位置信息
- 不收集用户身份信息

### 本地存储

本扩展使用浏览器内置的 `localStorage` 和 `chrome.storage` API 在用户设备本地存储以下数据：

| 数据类型 | 存储位置 | 用途 |
|:---------|:---------|:------|
| 翻译 API 设置（端点、Key、模型） | 本地 | AI 翻译功能配置 |
| TTS 设置（服务器地址、语音） | 本地 | 文字转语音配置 |
| 主题偏好 | 本地 | 保存用户主题选择 |
| 字体大小 | 本地 | 保存用户字体偏好 |
| 语言偏好 | 本地 | 保存界面语言选择 |
| 书签（位置索引、文本片段） | 本地 | 文档导航 |
| 高亮标注（位置、文本） | 本地 | 文本标记 |
| 最近文件列表 | 本地 | 快速打开最近文档 |

以上所有数据 **仅存储在用户本地设备上**，本扩展不会将任何数据上传到远程服务器。

### 网络请求

本扩展仅在以下用户主动触发的场景下发起网络请求：

1. **AI 翻译** — 当用户选中文本并点击翻译按钮时，选中文本会被发送到用户在设置中自行配置的 API 端点。本扩展不指定、不控制、不代理该请求，也不记录翻译内容。
2. **TTS 朗读** — 当用户点击朗读按钮时，文档文本会被发送到用户在设置中自行配置的 TTS 服务器。本扩展不指定、不控制、不代理该请求，也不记录朗读内容。
3. **URL 打开** — 当用户输入 URL 打开远程文档时，本扩展会直接向该 URL 发起请求以获取文件内容。

本扩展 **不会** 在未经用户主动操作的情况下发起任何网络请求。

### 权限说明

本扩展请求以下 Chrome API 权限：

| 权限 | 用途 | 说明 |
|:----|:-----|:------|
| `contextMenus` | 右键菜单 | 用户右键 .md 链接或选中文本时显示"用墨笺打开"选项，仅读取右键上下文信息 |
| `storage` | 本地存储 | 持久化保存用户设置和文档标记数据 |
| `activeTab` | 当前标签页 | 用户点击扩展图标时读取当前页面信息以提供智能操作选项 |

所有权限仅在用户主动操作时触发，不会在后台静默运行。

### 第三方服务

本扩展本身不集成任何第三方分析服务、广告服务或社交媒体追踪工具。AI 翻译和 TTS 功能中使用的 API 服务由用户自行配置和选择，本扩展不对第三方服务的数据处理行为负责。

### 数据传输

本扩展 **不会** 将用户的任何数据传输给任何第三方，除非：
- 用户主动触发翻译功能并将文本发送到自行配置的 API
- 用户主动触发 TTS 功能并将文本发送到自行配置的服务器
- 法律另有规定

### 数据删除

用户可通过以下方式删除所有本地数据：
1. 卸载本扩展（在 `chrome://extensions` 中移除）
2. 清除浏览器本地存储数据（浏览器设置 → 隐私与安全 → 清除浏览数据 → 高级 → 站点数据）

### 政策更新

本隐私政策可能会不定期更新。更新后的政策将在本页面公布。

### 联系方式

如有任何关于隐私政策的问题，请通过以下方式联系：
- GitHub Issues：https://github.com/gzmliang/mojian-extension/issues

---

## English Version

### Overview

InkNote (hereinafter referred to as "the Extension") is a Chrome browser extension for Markdown document reading and editing. The Extension takes user privacy seriously and commits to NOT collecting, storing, or transmitting any personally identifiable information.

### Data Collection

The Extension does **NOT collect** any personal data, including but not limited to:

- No browsing history collection
- No search history collection
- No form data collection
- No Cookie collection
- No device information collection (IP address, OS, browser version, etc.)
- No location data collection
- No user identity information collection

### Local Storage

The Extension uses the browser's built-in `localStorage` and `chrome.storage` APIs to store the following data locally on the user's device:

| Data Type | Storage Location | Purpose |
|:----------|:-----------------|:--------|
| Translation API settings (endpoint, key, model) | Local | AI translation configuration |
| TTS settings (server URL, voice) | Local | Text-to-speech configuration |
| Theme preference | Local | User theme selection |
| Font size | Local | User font preference |
| Language preference | Local | UI language selection |
| Bookmarks (position index, text snippet) | Local | Document navigation |
| Highlights (position, text) | Local | Text annotation |
| Recent files list | Local | Quick document access |

All of the above data is **stored only on the user's local device**. The Extension does not upload any data to remote servers.

### Network Requests

The Extension makes network requests only in the following user-initiated scenarios:

1. **AI Translation** — When the user selects text and clicks the translate button, the selected text is sent to the API endpoint configured by the user in Settings. The Extension does not specify, control, or proxy this request, nor does it record translation content.
2. **TTS Read Aloud** — When the user clicks the read-aloud button, document text is sent to the TTS server configured by the user in Settings. The Extension does not specify, control, or proxy this request, nor does it record audio content.
3. **URL Open** — When the user enters a URL to open a remote document, the Extension makes a direct request to that URL to fetch the file contents.

The Extension does **NOT** make any network requests without explicit user action.

### Permissions

The Extension requests the following Chrome API permissions:

| Permission | Purpose | Description |
|:-----------|:--------|:------------|
| `contextMenus` | Context menu | Shows "Open with InkNote" when right-clicking .md links or selected text; reads context info only |
| `storage` | Local storage | Persists user settings and document annotation data |
| `activeTab` | Current tab | Reads current page info when the user clicks the extension icon for smart actions |

All permissions are activated only upon explicit user action and do not run silently in the background.

### Third-Party Services

The Extension itself does not integrate any third-party analytics services, advertising services, or social media tracking tools. The API services used for AI translation and TTS are configured and chosen by the user. The Extension is not responsible for the data processing practices of these third-party services.

### Data Transmission

The Extension does **NOT** transmit any user data to any third party, unless:
- The user actively triggers the translation function and sends text to a self-configured API
- The user actively triggers the TTS function and sends text to a self-configured server
- Required by law

### Data Deletion

Users can delete all local data by:
1. Uninstalling the Extension (remove it from `chrome://extensions`)
2. Clearing browser local storage data (Settings → Privacy and Security → Clear browsing data → Advanced → Site data)

### Policy Updates

This privacy policy may be updated from time to time. Updated policies will be posted on this page.

### Contact

For any questions regarding this privacy policy, please contact us via:
- GitHub Issues: https://github.com/gzmliang/mojian-extension/issues
