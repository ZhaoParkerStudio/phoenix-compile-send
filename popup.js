// 全局状态
let currentTask = 'newsBg';
let config = {};
let gfxAttachments = [];
let ngLink = '', ngType = '', ngSubType = '';

// 計算下一個整點（自動推薦）
function getNextHourFormatted() {
  const now = new Date();
  let nextHour = now.getHours() + 1;
  if (nextHour === 24) nextHour = 0;
  return String(nextHour).padStart(2, '0') + '00';
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  const items = await chrome.storage.sync.get([
    'emailjsPublicKey', 'emailjsServiceID', 'emailjsTemplateID',
    'cloudName', 'cloudApiKey',
    'fromName', 'signature', 'deepseekKey', 'visionApiKey', 'recipientGroups', 'theme'
  ]);
  config = items;

  const theme = config.theme || 'blue';
  document.body.className = `theme-${theme}`;

  // 同步角标主题
  chrome.runtime.sendMessage({ action: 'updateBadgeTheme', theme: theme });

  if (!config.recipientGroups || config.recipientGroups.length === 0) {
    config.recipientGroups = [
      { name: '圖形同事', emails: 'gfxphx@gmail.com' },
      { name: 'NGB同事', emails: 'hkngb@phoenixtv.com, tpngb@hotmail.com' },
      { name: '我自己', emails: 'parkerzhao@phoenixtv.com' }
    ];
    chrome.storage.sync.set({ recipientGroups: config.recipientGroups });
  }

  const params = new URLSearchParams(window.location.search);
  ngLink = params.get('link');
  ngType = params.get('type');
  ngSubType = params.get('subType');

  if (ngLink) {
    document.getElementById('taskSelector').classList.add('hidden');
    document.getElementById('gfxPanel').classList.add('hidden');
    document.getElementById('ngbPanel').classList.remove('hidden');
    currentTask = 'ngb';
    initNgbPanel(params);
  } else {
    document.getElementById('ngbPanel').classList.add('hidden');
    const stored = await chrome.storage.local.get('lastGfxTask');
    currentTask = stored.lastGfxTask || 'newsBg';
    initGfxPanel();
  }

  // 事件绑定
  document.getElementById('taskTypeSelect').addEventListener('change', onTaskSwitch);
  document.getElementById('addLocalBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('addUrlBtn').addEventListener('click', toggleUrlInput);
  document.getElementById('confirmUrlBtn').addEventListener('click', addUrlAttachment);
  document.getElementById('fileInput').addEventListener('change', handleLocalFiles);
  document.getElementById('gfxGenerateBtn').addEventListener('click', gfxGenerate);
  document.getElementById('gfxSendBtn').addEventListener('click', gfxSend);
  document.getElementById('gfxClearBtn').addEventListener('click', clearQueue);
  document.getElementById('ngbGenerateBtn').addEventListener('click', ngbGenerate);
  document.getElementById('ngbSendBtn').addEventListener('click', ngbSend);
  document.getElementById('gfxSuggestionBtn')?.addEventListener('click', gfxSuggestion);
  document.getElementById('ngbSuggestionBtn')?.addEventListener('click', ngbSuggestion);
  document.getElementById('gfxAnalyzeBtn')?.addEventListener('click', analyzeImages);
});

// ---------- GFX 面板 ----------
async function initGfxPanel() {
  const taskSelect = document.getElementById('taskTypeSelect');
  if (currentTask === 'newsBg') taskSelect.value = 'newsBg';
  else if (currentTask === 'transparent') taskSelect.value = 'transparent';
  else if (currentTask === 'mapStatic') taskSelect.value = 'mapStatic';
  else if (currentTask === 'mapAnimated') taskSelect.value = 'mapAnimated';

  populateRecipients('recipientGroup', 'customRecipientGfx');
  await loadQueue(currentTask);

  // 自動填入下一個整點（若為空）
  const airTimeInput = document.getElementById('airTime');
  if (!airTimeInput.value) {
    airTimeInput.value = getNextHourFormatted();
  }

  const pageTitle = await getCurrentPageTitle();
  if (pageTitle) {
    document.getElementById('gfxDescription').value = pageTitle;
  }
}

async function loadQueue(taskType) {
  const key = `gfxQueue_${taskType}`;
  const data = await chrome.storage.local.get(key);
  const rawQueue = data[key] || [];
  gfxAttachments = rawQueue.map(item => ({
    url: item.url,
    base64: null,
    mimeType: 'image/png',
    name: item.url.split('/').pop() || 'image.png',
    alt: item.alt || '',
    pageTitle: item.pageTitle || ''
  }));
  renderAttachments();
  if (gfxAttachments.length > 0 && !document.getElementById('gfxDescription').value) {
    const first = gfxAttachments[0];
    document.getElementById('gfxDescription').value = first.alt || first.pageTitle || '';
  }
  updateAttachCount();
}

function renderAttachments() {
  const container = document.getElementById('attachmentList');
  container.innerHTML = '';
  gfxAttachments.forEach((att, index) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:60px;height:60px;display:inline-block;margin:4px;';
    const img = document.createElement('img');
    img.src = att.url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    const del = document.createElement('span');
    del.style.cssText = 'position:absolute;top:-6px;right:-6px;background:red;color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;font-size:12px;cursor:pointer;';
    del.textContent = '×';
    del.addEventListener('click', () => {
      gfxAttachments.splice(index, 1);
      renderAttachments();
      updateAttachCount();
    });
    wrapper.appendChild(img);
    wrapper.appendChild(del);
    container.appendChild(wrapper);
  });
}

function updateAttachCount() { document.getElementById('attachCount').textContent = gfxAttachments.length; }
function toggleUrlInput() { document.getElementById('urlInput').classList.toggle('hidden'); document.getElementById('confirmUrlBtn').classList.toggle('hidden'); }

async function addUrlAttachment() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  gfxAttachments.push({ url, base64: null, mimeType: 'image/png', name: url.split('/').pop() || 'image.png', alt: '', pageTitle: '' });
  renderAttachments(); updateAttachCount();
  document.getElementById('urlInput').value = '';
  document.getElementById('urlInput').classList.add('hidden');
  document.getElementById('confirmUrlBtn').classList.add('hidden');
}

async function handleLocalFiles(e) {
  const files = e.target.files;
  for (const file of files) {
    const base64 = await fileToBase64(file);
    gfxAttachments.push({ url: URL.createObjectURL(file), base64, mimeType: file.type, name: file.name, alt: '', pageTitle: '' });
  }
  renderAttachments(); updateAttachCount();
  document.getElementById('fileInput').value = '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Cloudinary 上传
async function uploadToCloudinary(base64Data, fileName) {
  const { cloudName, cloudApiKey } = config;
  if (!cloudName || !cloudApiKey) throw new Error('請先在選項頁設定 Cloud Name 和 API Key');
  const formData = new FormData();
  formData.append('file', `data:image/png;base64,${base64Data}`);
  formData.append('upload_preset', 'unsigned_preset');
  formData.append('api_key', cloudApiKey);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
  const data = await response.json();
  if (data.secure_url) return data.secure_url;
  else throw new Error(data.error?.message || 'Cloudinary 上傳失敗');
}

// AI 建议描述
async function gfxSuggestion() {
  const status = document.getElementById('status');
  status.textContent = 'AI 生成建議中…';
  try {
    const taskNameMap = { newsBg: '新聞底', transparent: '透明底', mapStatic: '靜地圖', mapAnimated: '動地圖' };
    const taskName = taskNameMap[currentTask] || '新聞底';
    const oldDesc = document.getElementById('gfxDescription').value.trim();
    const altTexts = gfxAttachments.map(a => a.alt).filter(Boolean).join('、');
    
    const infoPrompt = `根據以下資訊，生成一個12字以內的香港繁體中文圖片內容描述，以及一個6字以內的香港繁體中文SLUG。
任務：${taskName}
頁面標題：${oldDesc || '無'}
圖片alt：${altTexts || '無'}
附件數量：${gfxAttachments.length}張
要求：描述必須具體反映內容，SLUG 應提煉關鍵事件或主體。
輸出嚴格JSON：{"description":"描述","slug":"SLUG"}`;
    
    const info = await callDeepSeekJSON(infoPrompt);
    document.getElementById('gfxDescription').value = info.description;
    document.getElementById('slug').value = info.slug;
    status.textContent = '✅ 建議已填入，可按需修改';
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

async function ngbSuggestion() {
  const status = document.getElementById('status');
  status.textContent = 'AI 生成建議中…';
  try {
    const taskDisplay = document.getElementById('ngbTaskDisplay').value;
    const oldDesc = document.getElementById('ngbDescription').value.trim();
    const link = document.getElementById('ngbLink').value.trim();
    
    const descPrompt = `根據以下資訊，用香港繁體中文生成網頁/視頻內容描述（12字以內，必須具體反映實際內容）。
任務：${taskDisplay}
網頁標題：${oldDesc || '無'}
連結：${link}
只返回描述文字。`;
    const desc = await callDeepSeekSimple(descPrompt);
    document.getElementById('ngbDescription').value = desc;
    status.textContent = '✅ 建議已填入，可按需修改';
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

// ========== AI 读图（调用智谱 GLM-4V-Flash） ==========
async function analyzeImages() {
  const status = document.getElementById('status');
  status.textContent = 'AI 讀圖中…';
  try {
    const apiKey = config.visionApiKey;
    if (!apiKey) throw new Error('請先在選項頁設定視覺模型 API Key（智譜）');

    if (gfxAttachments.length === 0) throw new Error('請先添加至少一張圖片');

    const messages = [
      {
        role: 'user',
        content: []
      }
    ];

    for (const att of gfxAttachments) {
      let base64Data = att.base64;
      let mimeType = att.mimeType || 'image/png';
      if (!base64Data) {
        const result = await downloadImage(att.url);
        base64Data = result.data;
        mimeType = result.mimeType;
      }
      messages[0].content.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`
        }
      });
    }

    messages[0].content.push({
      type: 'text',
      text: '請用12字以內的香港繁體中文描述這些圖片的共同主題。只返回描述，不要其他文字。'
    });

    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'glm-4v-flash',
        messages: messages,
        max_tokens: 50,
        temperature: 0.3
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || '視覺模型調用失敗');
    
    const desc = data.choices[0].message.content.trim();
    document.getElementById('gfxDescription').value = desc;
    status.textContent = '✅ 圖片分析完成，描述已填入';
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

// 生成邮件（AI 辅助，不强制）
async function gfxGenerate() {
  const status = document.getElementById('status');
  status.textContent = 'AI 生成中…';
  try {
    const desc = document.getElementById('gfxDescription').value.trim();
    const slug = document.getElementById('slug').value.trim();
    const storage = document.querySelector('input[name="storageLocation"]:checked').value;
    const extra = document.getElementById('extra').value.trim();
    const taskNameMap = { newsBg: '新聞底', transparent: '透明底', mapStatic: '靜地圖', mapAnimated: '動地圖' };
    const taskName = taskNameMap[currentTask] || '新聞底';

    const prompt = buildGfxPrompt(desc || '（無）', slug || '（無）', storage, taskName, extra);
    const { subject, body } = await callDeepSeek(prompt);

    document.getElementById('gfxSubject').value = subject;
    document.getElementById('gfxBody').value = body;
    status.textContent = '✅ 生成完成，可編輯後發送';
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

function buildGfxPrompt(desc, slug, storage, taskName, extra) {
  let extraSection = extra ? `額外要求：\n${extra}\n` : '';
  const airTime = document.getElementById('airTime').value.trim();
  let timeLine = airTime ? `資訊台${airTime}用` : '';
  return `你是一位專業編輯助理。請根據以下資訊撰寫一封香港繁體中文的工作郵件：
- 收件人：圖形同事
- 要求：把附件圖片製作成【${taskName}】，存放在【${storage}】
- 圖片內容描述：${desc}
- SLUG：${slug}
${extraSection}
${timeLine ? '- 使用時間：' + timeLine : ''}
- 寄件人簽名：
${config.fromName || 'Parker'}
${config.signature || '資訊台北京編譯中心 / 7-7164'}

請讓郵件語氣禮貌、專業、簡潔，不必使用固定格式，只需清晰傳達任務。可參考以下範例郵件：
---
GRAPHICS同事您好！

麻煩幫忙製作一張平陸運河路線的靜地圖，參考圖請見附件。
請做：新聞底；存H盤；SLUG：平陸運河；資訊台1500要用。

謝謝！辛苦！
Parker
資訊台北京編譯中心
7-7164
---
輸出嚴格JSON：{"subject":"主題","body":"正文"}。主題格式建議為“${desc} ${taskName}”。`;
}

// ---------- NGB 面板 ----------
async function initNgbPanel(params) {
  document.getElementById('ngbLink').value = ngLink;
  const taskMap = { downloadVideo: '視頻下載', record: '錄屏', downloadPageVideo: '視頻下載（網頁內）' };
  document.getElementById('ngbTaskDisplay').value = taskMap[ngSubType] || '';
  populateRecipients('ngbRecipient', 'customRecipientNgb');
  const ngbSelect = document.getElementById('ngbRecipient');
  for (let i = 0; i < ngbSelect.options.length; i++) {
    if (ngbSelect.options[i].text.toLowerCase().includes('ngb') || ngbSelect.options[i].text.includes('自己')) {
      ngbSelect.selectedIndex = i;
      break;
    }
  }
  const pageTitle = params.get('pageTitle') || await getCurrentPageTitle();
  if (pageTitle) {
    document.getElementById('ngbDescription').value = pageTitle;
  }
}

async function ngbGenerate() {
  const status = document.getElementById('status');
  status.textContent = 'AI 生成中…';
  try {
    const desc = document.getElementById('ngbDescription').value.trim();
    const link = document.getElementById('ngbLink').value.trim();
    const storage = document.querySelector('input[name="ngbStorage"]:checked').value;
    const taskDisplay = document.getElementById('ngbTaskDisplay').value;

    let prompt;
    if (ngSubType === 'record') {
      prompt = `你是一位專業編輯助理。請撰寫一封香港繁體中文郵件，要求錄屏網站【${link}】到【${storage}】。描述：${desc || '（無）'}。簽名：${config.fromName}\n${config.signature}。語氣禮貌、專業，不必拘泥格式。輸出JSON：{"subject":"主題","body":"正文"}。主題建議“${desc || ''} 請幫錄屏”。`;
    } else {
      prompt = `你是一位專業編輯助理。請撰寫一封香港繁體中文郵件，要求下載視頻【${link}】到【${storage}】。描述：${desc || '（無）'}。簽名：${config.fromName}\n${config.signature}。語氣禮貌、專業，不必拘泥格式。輸出JSON：{"subject":"主題","body":"正文"}。主題建議“${desc || ''} 請下載”。`;
    }

    const { subject, body } = await callDeepSeek(prompt);

    document.getElementById('ngbSubject').value = subject;
    document.getElementById('ngbBody').value = body;
    status.textContent = '✅ 生成完成，可編輯後發送';
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
}

// ---------- 发送逻辑 ----------
async function gfxSend() {
  const status = document.getElementById('status');
  try {
    const toEmails = getRecipientEmails('recipientGroup', 'customRecipientGfx');
    if (!toEmails) throw new Error('請填寫收件人郵件');
    let subject = document.getElementById('gfxSubject').value.trim();
    let body = document.getElementById('gfxBody').value.trim();
    if (!subject && !body) throw new Error('請輸入主題或正文');
    if (gfxAttachments.length === 0) throw new Error('請添加至少一張圖片');

    status.textContent = '正在上載圖片…';
    const imageLinks = [];
    for (const att of gfxAttachments) {
      let base64Data = att.base64;
      if (!base64Data) {
        const result = await downloadImage(att.url);
        base64Data = result.data;
      }
      const url = await uploadToCloudinary(base64Data, att.name || 'image.png');
      imageLinks.push(url);
    }

    if (imageLinks.length > 0) {
      let linksText = '\n\n圖片下載連結：\n';
      imageLinks.forEach((url, idx) => { linksText += `${idx + 1}. ${url}\n`; });
      body += linksText;
    }

    status.textContent = '正在發送…';
    await sendEmail(subject || '（無主題）', body, toEmails);
    await chrome.runtime.sendMessage({ action: 'clearQueue', taskType: currentTask });
    status.textContent = '✅ 郵件已發送！窗口即將關閉';
    setTimeout(() => window.close(), 2000);
  } catch (e) {
    status.textContent = '❌ ' + e.message;
    setTimeout(() => window.close(), 3000);
  }
}

async function ngbSend() {
  const status = document.getElementById('status');
  try {
    const toEmails = getRecipientEmails('ngbRecipient', 'customRecipientNgb');
    if (!toEmails) throw new Error('請填寫收件人郵件');
    const subject = document.getElementById('ngbSubject').value.trim();
    const body = document.getElementById('ngbBody').value.trim();
    if (!subject && !body) throw new Error('請輸入主題或正文');

    status.textContent = '發送中…';
    await sendEmail(subject || '（無主題）', body, toEmails);
    status.textContent = '✅ 郵件已發送！窗口即將關閉';
    setTimeout(() => window.close(), 2000);
  } catch (e) {
    status.textContent = '❌ ' + e.message;
    setTimeout(() => window.close(), 3000);
  }
}

// EmailJS 发送
async function sendEmail(subject, body, toEmails) {
  const { emailjsPublicKey, emailjsServiceID, emailjsTemplateID } = config;
  if (!emailjsPublicKey || !emailjsServiceID || !emailjsTemplateID) throw new Error('請先在選項頁設定 EmailJS 參數');
  const payload = {
    service_id: emailjsServiceID,
    template_id: emailjsTemplateID,
    user_id: emailjsPublicKey,
    template_params: {
      to_email: toEmails,
      subject: subject,
      message: body,
      from_name: config.fromName || 'Parker'
    }
  };
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`發送失敗: ${await response.text()}`);
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'downloadImage', url }, response => {
      if (response.success) resolve({ data: response.data, mimeType: response.mimeType });
      else reject(new Error(response.error));
    });
  });
}

async function getCurrentPageTitle() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getCurrentPageTitle' }, response => resolve(response?.title || ''));
  });
}

function populateRecipients(selectId, customInputId) {
  const select = document.getElementById(selectId);
  const customInput = document.getElementById(customInputId);
  select.innerHTML = '';
  if (!config.recipientGroups || config.recipientGroups.length === 0) {
    config.recipientGroups = [
      { name: '圖形同事', emails: 'gfxphx@gmail.com' },
      { name: 'NGB同事', emails: 'hkngb@phoenixtv.com, tpngb@hotmail.com' },
      { name: '我自己', emails: 'parkerzhao@phoenixtv.com' }
    ];
    chrome.storage.sync.set({ recipientGroups: config.recipientGroups });
  }
  config.recipientGroups.forEach((g, idx) => {
    select.appendChild(new Option(`${g.name} (${g.emails})`, idx));
  });
  select.appendChild(new Option('✏️ 自訂...', 'custom'));
  select.addEventListener('change', () => {
    customInput.style.display = select.value === 'custom' ? 'block' : 'none';
  });
  if (select.options.length > 0) select.selectedIndex = 0;
}

function getRecipientEmails(selectId, customInputId) {
  const select = document.getElementById(selectId);
  const customInput = document.getElementById(customInputId);
  if (select.value === 'custom') {
    return customInput.value.trim();
  } else {
    const groupIdx = parseInt(select.value);
    const group = config.recipientGroups[groupIdx];
    return group ? group.emails : '';
  }
}

function onTaskSwitch() {
  const val = document.getElementById('taskTypeSelect').value;
  if (val === 'ngb') {
    document.getElementById('gfxPanel').classList.add('hidden');
    document.getElementById('ngbPanel').classList.remove('hidden');
    currentTask = 'ngb';
  } else {
    document.getElementById('ngbPanel').classList.add('hidden');
    document.getElementById('gfxPanel').classList.remove('hidden');
    currentTask = val;
    chrome.storage.local.set({ lastGfxTask: val });
    loadQueue(currentTask);
  }
}

async function clearQueue() {
  await chrome.runtime.sendMessage({ action: 'clearQueue', taskType: currentTask });
  gfxAttachments = [];
  renderAttachments();
  updateAttachCount();
  document.getElementById('status').textContent = '隊列已清空';
}

// DeepSeek 调用系列
async function callDeepSeek(prompt) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 錯誤: ${await response.text()}`);
  const data = await response.json();
  const content = JSON.parse(data.choices[0].message.content);
  return { subject: content.subject, body: content.body };
}

async function callDeepSeekSimple(prompt) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 50,
      stop: ['\n']
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 錯誤: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callDeepSeekJSON(prompt) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.deepseekKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    })
  });
  if (!response.ok) throw new Error(`DeepSeek 錯誤: ${await response.text()}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

function updateBadge() {}