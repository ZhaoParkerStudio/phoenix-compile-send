// 預設收件人組（不包含「我自己」）
const defaultGroups = [
  { name: '圖形同事', emails: 'gfxphx@gmail.com' },
  { name: 'NGB同事', emails: 'hkngb@phoenixtv.com, tpngb@hotmail.com' }
];

// 加載設定並渲染
chrome.storage.sync.get([
  'emailjsPublicKey', 'emailjsServiceID', 'emailjsTemplateID',
  'cloudName', 'cloudApiKey',
  'fromName', 'signature', 'deepseekKey', 'visionApiKey', 'recipientGroups', 'theme'
], (items) => {
  document.getElementById('emailjsPublicKey').value = items.emailjsPublicKey || 'kkvGYDki1X2Dgntrb';
  document.getElementById('emailjsServiceID').value = items.emailjsServiceID || 'service_0z1di8n';
  document.getElementById('emailjsTemplateID').value = items.emailjsTemplateID || 'template_yollu0g';
  document.getElementById('cloudName').value = items.cloudName || 'dcg3rnrmq';
  document.getElementById('cloudApiKey').value = items.cloudApiKey || '521787134687759';
  document.getElementById('fromName').value = items.fromName || '';
  document.getElementById('signature').value = items.signature || '';
  document.getElementById('deepseekKey').value = items.deepseekKey || '';
  document.getElementById('visionApiKey').value = items.visionApiKey || '';

  const theme = items.theme || 'blue';
  document.getElementById('themeSelect').value = theme;
  // 应用主题到当前页面
  document.body.className = 'theme-' + theme;

  let groups = items.recipientGroups;
  if (!groups || groups.length === 0) {
    groups = defaultGroups;
    chrome.storage.sync.set({ recipientGroups: groups });
  }
  renderGroups(groups);
});

// 高級設定折疊
document.getElementById('toggleAdvancedBtn').addEventListener('click', () => {
  const section = document.getElementById('advancedSettings');
  const btn = document.getElementById('toggleAdvancedBtn');
  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    btn.textContent = '⚙️ 隱藏高級設定';
  } else {
    section.classList.add('hidden');
    btn.textContent = '⚙️ 高級設定（通常無需修改）';
  }
});

function renderGroups(groups) {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '';
  groups.forEach((g, i) => {
    const div = document.createElement('div');
    div.className = 'group-item';
    div.innerHTML = `
      <div class="inline">
        <input type="text" class="group-name" value="${escapeHtml(g.name)}" placeholder="組名">
        <input type="text" class="group-emails" value="${escapeHtml(g.emails)}" placeholder="郵件，逗號分隔" style="flex:2">
        <button class="remove-group" data-index="${i}">❌</button>
      </div>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll('.remove-group').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index);
      const currentGroups = getCurrentGroups();
      currentGroups.splice(idx, 1);
      renderGroups(currentGroups);
    });
  });
}

function getCurrentGroups() {
  const names = document.querySelectorAll('.group-name');
  const emails = document.querySelectorAll('.group-emails');
  const groups = [];
  for (let i = 0; i < names.length; i++) {
    groups.push({
      name: names[i].value.trim(),
      emails: emails[i].value.trim()
    });
  }
  return groups;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.getElementById('addGroupBtn').addEventListener('click', () => {
  const currentGroups = getCurrentGroups();
  currentGroups.push({ name: '', emails: '' });
  renderGroups(currentGroups);
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const theme = document.getElementById('themeSelect').value;
  const config = {
    emailjsPublicKey: document.getElementById('emailjsPublicKey').value.trim(),
    emailjsServiceID: document.getElementById('emailjsServiceID').value.trim(),
    emailjsTemplateID: document.getElementById('emailjsTemplateID').value.trim(),
    cloudName: document.getElementById('cloudName').value.trim(),
    cloudApiKey: document.getElementById('cloudApiKey').value.trim(),
    fromName: document.getElementById('fromName').value.trim(),
    signature: document.getElementById('signature').value.trim(),
    deepseekKey: document.getElementById('deepseekKey').value.trim(),
    visionApiKey: document.getElementById('visionApiKey').value.trim(),
    theme: theme,
    recipientGroups: getCurrentGroups()
  };
  chrome.storage.sync.set(config, () => {
    // 立即应用主题到当前页面
    document.body.className = 'theme-' + theme;
    // 通知 background 更新角标颜色
    chrome.runtime.sendMessage({ action: 'updateBadgeTheme', theme: theme });
    const status = document.getElementById('statusMsg');
    status.textContent = '✅ 設定已儲存';
    setTimeout(() => status.textContent = '', 2000);
  });
});