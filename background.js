// 墨笺 InkNote — Background Service Worker

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-with-inknote',
    title: '用墨笺打开链接',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'open-text-with-inknote',
    title: '用墨笺打开选中内容',
    contexts: ['selection'],
  });
});

// 点击扩展图标 → 打开阅读器
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'reader.html' });
});

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-with-inknote' && info.linkUrl) {
    chrome.tabs.create({ url: `reader.html?url=${encodeURIComponent(info.linkUrl)}` });
  }
  if (info.menuItemId === 'open-text-with-inknote' && info.selectionText) {
    chrome.tabs.create({ url: `reader.html?text=${encodeURIComponent(info.selectionText)}` });
  }
});
