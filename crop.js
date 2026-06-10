const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
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

// 错误处理
img.onerror = () => {
  info.textContent = '圖片載入失敗，請重試';
  setTimeout(() => window.close(), 2000);
};

img.onload = () => {
  const maxWidth = window.innerWidth;
  const maxHeight = window.innerHeight;
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.floor(width * ratio);
    height = Math.floor(height * ratio);
  }
  canvas.width = width;
  canvas.height = height;
  scaleX = img.naturalWidth / width;
  scaleY = img.naturalHeight / height;
  drawOverlay();
};

// 从 storage 加载截图
chrome.storage.local.get('lastScreenshot', (result) => {
  if (result.lastScreenshot) {
    img.src = result.lastScreenshot;
  } else {
    info.textContent = '找不到截圖資料，請重試';
    setTimeout(() => window.close(), 1500);
  }
});

function drawOverlay() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  if (cropBtn.dataset.hasRect === 'true' && !isNaN(startX) && !isNaN(startY) && !isNaN(currentX) && !isNaN(currentY)) {
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    if (width > 0 && height > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      
      ctx.strokeStyle = '#1E88E5';
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, width, height);
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  currentX = startX;
  currentY = startY;
  cropBtn.dataset.hasRect = 'false';
  cropBtn.disabled = true;
  info.textContent = '拖拽選取區域';
});

window.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  currentX = e.clientX - rect.left;
  currentY = e.clientY - rect.top;
  currentX = Math.max(0, Math.min(currentX, canvas.width));
  currentY = Math.max(0, Math.min(currentY, canvas.height));
  drawOverlay();
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  if (scaleX && scaleY) {
    const realW = Math.round(width * scaleX);
    const realH = Math.round(height * scaleY);
    info.textContent = `${realW} × ${realH} px`;
  }
  if (width > 5 && height > 5) {
    cropBtn.dataset.hasRect = 'true';
    cropBtn.disabled = false;
  }
});

window.addEventListener('mouseup', () => {
  isDrawing = false;
});

cropBtn.addEventListener('click', () => {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  if (width < 5 || height < 5) return;
  
  const sx = left * scaleX;
  const sy = top * scaleY;
  const sWidth = width * scaleX;
  const sHeight = height * scaleY;
  
  const offCanvas = document.createElement('canvas');
  offCanvas.width = sWidth;
  offCanvas.height = sHeight;
  const offCtx = offCanvas.getContext('2d');
  offCtx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  croppedDataUrl = offCanvas.toDataURL('image/png');
  
  previewImg.src = croppedDataUrl;
  taskPanel.style.display = 'flex';
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  window.close();
});

document.querySelectorAll('.task-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const task = btn.dataset.task;
    chrome.runtime.sendMessage({ 
      action: 'addCroppedToTask', 
      dataUrl: croppedDataUrl,
      taskType: task 
    }, () => {
      window.close();
    });
  });
});

cancelTaskBtn.addEventListener('click', () => {
  taskPanel.style.display = 'none';
});