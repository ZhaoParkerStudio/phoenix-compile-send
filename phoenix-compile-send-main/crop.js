const baseCanvas = document.getElementById('baseCanvas');
const baseCtx = baseCanvas.getContext('2d');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const info = document.getElementById('info');
const cropBtn = document.getElementById('cropBtn');
const taskPanel = document.getElementById('taskPanel');
const previewImg = document.getElementById('previewImg');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');

let isDrawing = false;
let startX, startY, currentX, currentY;
let img = new Image();
let scaleX, scaleY;
let croppedDataUrl = null;
let mouseX = -100, mouseY = -100;

img.onerror = () => {
  info.textContent = '圖片載入失敗，請重試';
  setTimeout(() => window.close(), 2000);
};

img.onload = () => {
  const maxWidth = window.innerWidth;
  const maxHeight = window.innerHeight;
  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > maxWidth || h > maxHeight) {
    const ratio = Math.min(maxWidth / w, maxHeight / h);
    w = Math.floor(w * ratio); h = Math.floor(h * ratio);
  }
  baseCanvas.width = w; baseCanvas.height = h;
  overlayCanvas.width = w; overlayCanvas.height = h;
  scaleX = img.naturalWidth / w;
  scaleY = img.naturalHeight / h;
  baseCtx.drawImage(img, 0, 0, w, h);
  drawOverlay();
};

chrome.storage.local.get('lastScreenshot', (result) => {
  if (result.lastScreenshot) img.src = result.lastScreenshot;
  else { info.textContent = '找不到截圖資料，請重試'; setTimeout(() => window.close(), 1500); }
});

function drawOverlay() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (cropBtn.dataset.hasRect === 'true' && !isNaN(startX) && !isNaN(startY) && !isNaN(currentX) && !isNaN(currentY)) {
    const left = Math.min(startX, currentX), top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX), height = Math.abs(currentY - startY);
    if (width > 0 && height > 0) {
      overlayCtx.save();
      overlayCtx.shadowColor = 'rgba(255,255,255,0.3)';
      overlayCtx.shadowBlur = 8;
      overlayCtx.clearRect(left, top, width, height);
      overlayCtx.restore();
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.9)';
      overlayCtx.lineWidth = 2;
      overlayCtx.strokeRect(left, top, width, height);
    }
  }

  if (!isDrawing) {
    const cursorSize = 14;
    overlayCtx.save();
    overlayCtx.strokeStyle = '#FF5722';
    overlayCtx.lineWidth = 2;
    overlayCtx.shadowColor = 'rgba(0,0,0,0.6)';
    overlayCtx.shadowBlur = 2;
    overlayCtx.beginPath(); overlayCtx.moveTo(mouseX - cursorSize, mouseY); overlayCtx.lineTo(mouseX + cursorSize, mouseY); overlayCtx.stroke();
    overlayCtx.beginPath(); overlayCtx.moveTo(mouseX, mouseY - cursorSize); overlayCtx.lineTo(mouseX, mouseY + cursorSize); overlayCtx.stroke();
    overlayCtx.fillStyle = '#FFFFFF'; overlayCtx.beginPath(); overlayCtx.arc(mouseX, mouseY, 3, 0, Math.PI*2); overlayCtx.fill();
    overlayCtx.restore();
  }
}

baseCanvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  const rect = baseCanvas.getBoundingClientRect();
  startX = e.clientX - rect.left; startY = e.clientY - rect.top;
  currentX = startX; currentY = startY;
  cropBtn.dataset.hasRect = 'false'; cropBtn.disabled = true;
  info.textContent = '拖拽選取區域';
  drawOverlay();
});

baseCanvas.addEventListener('mousemove', (e) => {
  const rect = baseCanvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
  if (isDrawing) {
    currentX = Math.max(0, Math.min(mouseX, baseCanvas.width));
    currentY = Math.max(0, Math.min(mouseY, baseCanvas.height));
    const w = Math.abs(currentX - startX), h = Math.abs(currentY - startY);
    if (scaleX && scaleY) info.textContent = `${Math.round(w*scaleX)} × ${Math.round(h*scaleY)} px`;
    if (w > 5 && h > 5) { cropBtn.dataset.hasRect = 'true'; cropBtn.disabled = false; }
  }
  drawOverlay();
});

baseCanvas.addEventListener('mouseup', () => { isDrawing = false; drawOverlay(); });

cropBtn.addEventListener('click', () => {
  const left = Math.min(startX, currentX), top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX), height = Math.abs(currentY - startY);
  if (width < 5 || height < 5) return;
  const sx = left * scaleX, sy = top * scaleY, sWidth = width * scaleX, sHeight = height * scaleY;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = sWidth; offCanvas.height = sHeight;
  offCanvas.getContext('2d').drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  croppedDataUrl = offCanvas.toDataURL('image/png');
  previewImg.src = croppedDataUrl;
  taskPanel.style.display = 'flex';
});

document.getElementById('cancelBtn').addEventListener('click', () => window.close());

document.querySelectorAll('.task-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const task = btn.dataset.task;
    // 存储图片到 storage，然后发送轻量消息
    chrome.storage.local.set({ tempCroppedImage: croppedDataUrl }, () => {
      chrome.runtime.sendMessage({ action: 'croppedImageReady', taskType: task }, () => window.close());
    });
  });
});

cancelTaskBtn.addEventListener('click', () => { taskPanel.style.display = 'none'; });