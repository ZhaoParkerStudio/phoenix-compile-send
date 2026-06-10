// 任务类型常量
const GFX_TASKS = {
  newsBg: 'newsBg',
  transparent: 'transparent',
  mapStatic: 'mapStatic',
  mapAnimated: 'mapAnimated'
};
const NGB_TASKS = {
  downloadVideo: 'downloadVideo',
  record: 'record',
  downloadPageVideo: 'downloadPageVideo'
};

// 主题色映射
const THEME_COLORS = {
  blue: '#1E88E5',
  red: '#D40000',
  green: '#2E7D32',
  dark: '#424242'
};

// 初始化菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // 图片右键：四个 GFX 任务 + 截屏
    chrome.contextMenus.create({ id: "gfxNewsBg", title: "📤 做新聞底圖", contexts: ["image"] });
    chrome.contextMenus.create({ id: "gfxTransparent", title: "📤 做透明底圖", contexts: ["image"] });
    chrome.contextMenus.create({ id: "gfxMapStatic", title: "📤 做靜地圖", contexts: ["image"] });
    chrome.contextMenus.create({ id: "gfxMapAnimated", title: "📤 做動地圖", contexts: ["image"] });
    chrome.contextMenus.create({ id: "cropScreen", title: "📸 截取屏幕區域", contexts: ["page", "image"] });

    // 视频右键：直接“視頻下載（NGB）”
    chrome.contextMenus.create({ id: "ngbVideo", title: "📤 視頻下載（NGB）", contexts: ["video"] });

    // 页面右键：录屏、視頻下載、截屏
    chrome.contextMenus.create({ id: "ngbRecord", title: "📤 錄屏（NGB）", contexts: ["page"] });
    chrome.contextMenus.create({ id: "ngbDownloadPageVideo", title: "📤 視頻下載（NGB）", contexts: ["page"] });

    // 扩展图标右键菜单：清空所有队列
    chrome.contextMenus.create({
      id: "clearAllQueues",
      title: "🗑️ 清空所有 GFX 隊列",
      contexts: ["action"]
    });
  });

  // 设置默认主题色（若尚未设置）
  chrome.storage.sync.get('theme', (items) => {
    const theme = items.theme || 'blue';
    chrome.storage.local.set({ currentTheme: theme });
    updateBadge();
  });
});

// 获取图片上下文信息
async function getImageContext(tabId, srcUrl) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (url) => {
        const img = document.querySelector(`img[src="${url}"]`);
        return { alt: img ? img.alt : '', pageTitle: document.title };
      },
      args: [srcUrl]
    });
    return results[0].result;
  } catch (e) {
    return { alt: '', pageTitle: '' };
  }
}

// 处理菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;

  // 清空所有队列
  if (menuId === 'clearAllQueues') {
    const keys = [
      'gfxQueue_newsBg', 'gfxQueue_transparent',
      'gfxQueue_mapStatic', 'gfxQueue_mapAnimated'
    ];
    await chrome.storage.local.remove(keys);
    updateBadge();
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '隊列已清空',
      message: '所有 GFX 圖片隊列已清空。'
    });
    return;
  }

  // 截屏
  if (menuId === 'cropScreen') {
    startCrop();
    return;
  }

  // GFX 图片任务
  if (menuId === 'gfxNewsBg' || menuId === 'gfxTransparent' || menuId === 'gfxMapStatic' || menuId === 'gfxMapAnimated') {
    let taskType;
    if (menuId === 'gfxNewsBg') taskType = GFX_TASKS.newsBg;
    else if (menuId === 'gfxTransparent') taskType = GFX_TASKS.transparent;
    else if (menuId === 'gfxMapStatic') taskType = GFX_TASKS.mapStatic;
    else if (menuId === 'gfxMapAnimated') taskType = GFX_TASKS.mapAnimated;

    const imageUrl = info.srcUrl;
    const context = await getImageContext(tab.id, imageUrl);
    const item = {
      url: imageUrl,
      alt: context.alt,
      pageTitle: context.pageTitle,
      timestamp: Date.now()
    };
    const key = `gfxQueue_${taskType}`;
    const stored = await chrome.storage.local.get(key);
    const queue = stored[key] || [];
    queue.push(item);
    await chrome.storage.local.set({ [key]: queue });
    updateBadge();

    const taskNames = {
      newsBg: '新聞底圖',
      transparent: '透明底圖',
      mapStatic: '靜地圖',
      mapAnimated: '動地圖'
    };

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '已添加至隊列',
      message: `GFX - ${taskNames[taskType]}（共 ${queue.length} 張）`
    });

    // 自动打开管理面板（如果尚未打开）
    const popupUrl = chrome.runtime.getURL("popup.html");
    try {
      const existingWindows = await chrome.windows.getAll({ populate: true });
      const alreadyOpen = existingWindows.some(win => {
        return win.tabs && win.tabs.some(tab => tab.url && tab.url.includes(popupUrl));
      });
      if (!alreadyOpen) {
        const urlWithTask = popupUrl + `?autoTask=${taskType}`;
        chrome.windows.create({
          url: urlWithTask,
          type: "popup",
          width: 520,
          height: 700
        });
      }
    } catch (e) {
      chrome.windows.create({
        url: popupUrl + `?autoTask=${taskType}`,
        type: "popup",
        width: 520,
        height: 700
      });
    }
    return;
  }

  // NGB 视频下载（右键视频）
  if (menuId === 'ngbVideo') {
    openNgbPopup(tab, info.srcUrl, 'video', NGB_TASKS.downloadVideo);
    return;
  }

  // NGB 页面任务
  if (menuId === 'ngbRecord' || menuId === 'ngbDownloadPageVideo') {
    const taskType = menuId === 'ngbRecord' ? NGB_TASKS.record : NGB_TASKS.downloadPageVideo;
    openNgbPopup(tab, info.pageUrl, 'page', taskType);
  }
});

function openNgbPopup(tab, link, type, subType) {
  const url = new URL(chrome.runtime.getURL("popup.html"));
  url.searchParams.set("link", link);
  url.searchParams.set("type", type);
  url.searchParams.set("subType", subType);
  if (tab?.id) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.title })
      .then(results => { if (results?.[0]?.result) url.searchParams.set("pageTitle", results[0].result); })
      .catch(() => {})
      .finally(() => chrome.windows.create({ url: url.href, type: "popup", width: 520, height: 650 }));
  } else {
    chrome.windows.create({ url: url.href, type: "popup", width: 520, height: 650 });
  }
}

// 截屏流程
async function startCrop() {
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(chrome.runtime.lastError?.message || '無法擷取屏幕');
        } else {
          resolve(url);
        }
      });
    });
    await chrome.storage.local.set({ lastScreenshot: dataUrl });
    chrome.windows.create({
      url: chrome.runtime.getURL("crop.html"),
      type: "popup",
      state: "maximized"
    });
  } catch (err) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '截屏失敗',
      message: err.message || '發生未知錯誤'
    });
    console.error('截屏失败', err);
  }
}

// 更新图标角标（动态颜色）
async function updateBadge() {
  const allKeys = [
    GFX_TASKS.newsBg, GFX_TASKS.transparent, GFX_TASKS.mapStatic, GFX_TASKS.mapAnimated
  ].map(t => `gfxQueue_${t}`);
  const data = await chrome.storage.local.get(allKeys);
  let total = 0;
  allKeys.forEach(k => total += (data[k] || []).length);
  
  // 获取当前主题色
  const { currentTheme } = await chrome.storage.local.get('currentTheme');
  const themeColor = THEME_COLORS[currentTheme] || THEME_COLORS.blue;
  
  if (total > 0) {
    chrome.action.setBadgeText({ text: total.toString() });
    chrome.action.setBadgeBackgroundColor({ color: themeColor });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getQueue') {
    const key = `gfxQueue_${request.taskType}`;
    chrome.storage.local.get(key, result => {
      sendResponse({ queue: result[key] || [] });
    });
    return true;
  }
  if (request.action === 'clearQueue') {
    const key = `gfxQueue_${request.taskType}`;
    chrome.storage.local.remove(key, () => {
      updateBadge();
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.action === 'downloadImage') {
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error('下載失敗');
        const contentType = response.headers.get('content-type') || 'image/png';
        return response.arrayBuffer().then(buffer => ({ buffer, contentType }));
      })
      .then(({ buffer, contentType }) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        const base64 = btoa(binary);
        sendResponse({ success: true, data: base64, mimeType: contentType });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (request.action === 'getCurrentPageTitle') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => document.title
        }).then(results => sendResponse({ title: results?.[0]?.result || '' }))
        .catch(() => sendResponse({ title: '' }));
      } else {
        sendResponse({ title: '' });
      }
    });
    return true;
  }
  // 新截屏流程：直接添加到指定任务队列
  if (request.action === 'addCroppedToTask') {
    const { dataUrl, taskType } = request;
    const key = `gfxQueue_${taskType}`;
    chrome.storage.local.get(key, (result) => {
      const queue = result[key] || [];
      queue.push({
        url: dataUrl,
        alt: '',
        pageTitle: '',
        timestamp: Date.now()
      });
      chrome.storage.local.set({ [key]: queue }, () => {
        updateBadge();
        sendResponse({ success: true });
      });
    });
    return true;
  }
  // 更新主题色
  if (request.action === 'updateBadgeTheme') {
    const theme = request.theme || 'blue';
    chrome.storage.local.set({ currentTheme: theme }, () => {
      updateBadge();
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 520,
    height: 700
  });
});

// 启动时根据存储的主题更新角标
chrome.storage.local.get('currentTheme', (items) => {
  if (!items.currentTheme) {
    chrome.storage.sync.get('theme', (syncItems) => {
      const theme = syncItems.theme || 'blue';
      chrome.storage.local.set({ currentTheme: theme });
      updateBadge();
    });
  } else {
    updateBadge();
  }
});