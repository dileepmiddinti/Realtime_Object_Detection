/**
 * YOLO Vision — AI Object Detection Dashboard
 * script.js
 *
 * Handles: page routing, image upload, webcam detection,
 * results rendering, history table, analytics charts,
 * settings, and toast notifications.
 */

// ─────────────────────────────────────────────────────────
// LANDING PAGE NAVIGATION
// ─────────────────────────────────────────────────────────
function goToDashboard() {
  document.getElementById('landing-page').classList.remove('active');
  document.getElementById('dashboard-page').classList.add('active');
}

// ─────────────────────────────────────────────────────────
// CONFIG — reads from settings or uses defaults
// ─────────────────────────────────────────────────────────
const AppConfig = {
  backendUrl:       localStorage.getItem('backendUrl')   || 'http://127.0.0.1:5000',
  modelPath:        localStorage.getItem('modelPath')    || 'model/best.pt',
  confThreshold:    parseFloat(localStorage.getItem('confThreshold') || '0.25'),  // Lowered from 0.5
  iouThreshold:     parseFloat(localStorage.getItem('iouThreshold')  || '0.45'),
  maxDetections:    parseInt(localStorage.getItem('maxDetections')   || '100'),
};

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let currentMode       = null;    // 'image' | 'webcam'
let webcamStream      = null;    // MediaStream reference
let sessionCount      = 0;       // how many detections ran this session
let currentPage       = 1;       // history pagination
const ROWS_PER_PAGE   = 10;

// ─────────────────────────────────────────────────────────
// DOM REFERENCES
// ─────────────────────────────────────────────────────────
const imageUpload      = document.getElementById('imageUpload');
const webcamCard       = document.getElementById('webcamCard');
const previewImage     = document.getElementById('previewImage');
const webcamFeed       = document.getElementById('webcamFeed');
const previewPlaceholder = document.getElementById('previewPlaceholder');
const detectionCanvas  = document.getElementById('detectionCanvas');
const previewLoading   = document.getElementById('previewLoading');
const detectBtn        = document.getElementById('detectBtn');
const clearPreviewBtn  = document.getElementById('clearPreviewBtn');
const objectList       = document.getElementById('objectList');
const resultsCount     = document.getElementById('resultsCount');
const detectionLog     = document.getElementById('detectionLog');
const historyTableBody = document.getElementById('historyTableBody');
const historySearch    = document.getElementById('historySearch');
const historyFilter    = document.getElementById('historyFilter');
const statusBadge      = document.getElementById('statusBadge');
const toastContainer   = document.getElementById('toastContainer');
const sidebarTotalDetections = document.getElementById('sidebarTotalDetections');
const sidebarTotalClasses    = document.getElementById('sidebarTotalClasses');
const metricDetections = document.getElementById('metricDetections');
const metricClasses    = document.getElementById('metricClasses');
const metricAvgConf    = document.getElementById('metricAvgConf');
const metricSessions   = document.getElementById('metricSessions');

// ─────────────────────────────────────────────────────────
// UTILITY — Toast notifications
// ─────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast ${type !== 'success' ? type : ''}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '•'}</span><span class="toast-msg">${message}</span>`;
  toastContainer.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.remove();
  }, 3100);
}

// ─────────────────────────────────────────────────────────
// UTILITY — Status badge
// ─────────────────────────────────────────────────────────
function setStatus(text, processing = false) {
  statusBadge.className = `status-badge${processing ? ' processing' : ''}`;
  statusBadge.innerHTML = `<span class="status-dot"></span> ${text}`;
}

// ─────────────────────────────────────────────────────────
// UTILITY — Format timestamp nicely
// ─────────────────────────────────────────────────────────
function formatTimestamp(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────
// PAGE NAVIGATION
// ─────────────────────────────────────────────────────────
const navItems  = document.querySelectorAll('.nav-item');
const allPages  = document.querySelectorAll('.page');
const pageTitle = document.getElementById('pageTitle');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const target = item.dataset.page;
    switchPage(target);
    closeSidebar();
  });
});

function switchPage(target) {
  navItems.forEach(i => i.classList.toggle('active', i.dataset.page === target));
  allPages.forEach(p => p.classList.toggle('active', p.id === `page-${target}`));

  const titles = { dashboard: 'Dashboard', history: 'Detection History', analytics: 'Analytics', settings: 'Settings' };
  pageTitle.textContent = titles[target] || target;

  // Load data when navigating to specific pages
  if (target === 'history') loadHistory();
  if (target === 'analytics') loadAnalytics();
}

// ─────────────────────────────────────────────────────────
// SIDEBAR (mobile toggle)
// ─────────────────────────────────────────────────────────
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const hamburger      = document.getElementById('hamburger');
const sidebarClose   = document.getElementById('sidebarClose');

hamburger.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('visible');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
}

// ─────────────────────────────────────────────────────────
// IMAGE UPLOAD HANDLER
// ─────────────────────────────────────────────────────────
imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Stop any active webcam
  stopWebcam();
  currentMode = 'image';

  // Show image preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    previewPlaceholder.style.display = 'none';
    previewImage.src = ev.target.result;
    previewImage.style.display = 'block';
    webcamFeed.style.display = 'none';
    clearCanvas();
    detectBtn.disabled = false;
    appendLog('image', `Loaded: ${file.name}`);
  };
  reader.readAsDataURL(file);
});

// ─────────────────────────────────────────────────────────
// WEBCAM HANDLER
// ─────────────────────────────────────────────────────────
webcamCard.addEventListener('click', toggleWebcam);

async function toggleWebcam() {
  if (webcamStream) {
    // Webcam already running — stop it
    stopWebcam();
    return;
  }

  try {
    // Request webcam access from browser
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    webcamStream = stream;
    webcamFeed.srcObject = stream;

    previewPlaceholder.style.display = 'none';
    previewImage.style.display = 'none';
    webcamFeed.style.display = 'block';
    clearCanvas();

    currentMode = 'webcam';
    detectBtn.disabled = false;
    setStatus('Webcam active', false);
    appendLog('webcam', 'Webcam started');
    showToast('Webcam started successfully');

    // Update webcam card label
    webcamCard.querySelector('.action-label').textContent = 'Stop Webcam';
    webcamCard.querySelector('.action-sub').textContent = 'Click to stop stream';
  } catch (err) {
    showToast('Could not access webcam: ' + err.message, 'error');
  }
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    webcamFeed.srcObject = null;
    webcamFeed.style.display = 'none';
    setStatus('Ready');
    webcamCard.querySelector('.action-label').textContent = 'Live Webcam';
    webcamCard.querySelector('.action-sub').textContent = 'Real-time detection';
  }
}

// ─────────────────────────────────────────────────────────
// CLEAR PREVIEW
// ─────────────────────────────────────────────────────────
clearPreviewBtn.addEventListener('click', () => {
  stopWebcam();
  previewImage.style.display = 'none';
  previewImage.src = '';
  previewPlaceholder.style.display = 'flex';
  clearCanvas();
  currentMode = null;
  detectBtn.disabled = true;
  objectList.innerHTML = '<div class="object-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>No objects detected yet</p></div>';
  resultsCount.textContent = '0 found';
  imageUpload.value = '';
});

// ─────────────────────────────────────────────────────────
// MAIN DETECTION — Run Detection button
// ─────────────────────────────────────────────────────────
detectBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  runDetection();
});

async function runDetection() {
  console.log('runDetection called, currentMode:', currentMode);
  console.log('imageUpload.files:', imageUpload.files);
  console.log('webcamStream:', webcamStream);

  if (!currentMode) {
    showToast('Please upload an image or enable webcam first', 'warning');
    return;
  }
  setStatus('Processing...', true);
  previewLoading.style.display = 'flex';
  detectBtn.disabled = true;

  try {
    let result;

    if (currentMode === 'image') {
      console.log('Running image detection...');
      result = await detectImage();
    } else if (currentMode === 'webcam') {
      console.log('Running webcam detection...');
      result = await detectWebcam();
    }

    console.log('Detection result:', result);
    
    if (result && result.detections) {
      console.log(`Found ${result.detections.length} detections`);
      renderResults(result.detections);
      drawBoundingBoxes(result.detections);
      sessionCount++;
      updateMetrics(result.detections);
      appendLog(currentMode, `${result.detections.length} object(s) detected`);
      showToast(`Detection complete — ${result.detections.length} object(s) found`);
    } else {
      console.warn('No detections in result', result);
      showToast('Detection complete but no objects found', 'warning');
    }

  } catch (err) {
    console.error('Detection error:', err);
    showToast('Detection failed: ' + err.message, 'error');
    appendLog(currentMode, 'Error: ' + err.message);
  } finally {
    previewLoading.style.display = 'none';
    detectBtn.disabled = false;
    setStatus('Ready');
  }
}

// ─────────────────────────────────────────────────────────
// API — Send image to backend for detection
// ─────────────────────────────────────────────────────────
async function detectImage() {
  console.log('detectImage called');
  const formData = new FormData();
  formData.append('image', imageUpload.files[0]);
  formData.append('conf_threshold', AppConfig.confThreshold);
  formData.append('iou_threshold',  AppConfig.iouThreshold);
  formData.append('max_det',        AppConfig.maxDetections);

  console.log('Sending request to:', `${AppConfig.backendUrl}/detect-image`);
  const response = await fetch(`${AppConfig.backendUrl}/detect-image`, {
    method: 'POST',
    body: formData,
  });

  console.log('Response status:', response.status);
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  const result = await response.json();
  console.log('Response data:', result);
  return result;
}

// ─────────────────────────────────────────────────────────
// API — Capture webcam frame and send for detection
// ─────────────────────────────────────────────────────────
async function detectWebcam() {
  console.log('detectWebcam called');
  // Capture current video frame onto an offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width  = webcamFeed.videoWidth;
  canvas.height = webcamFeed.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(webcamFeed, 0, 0);

  // Convert canvas to blob and send to backend
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  const formData = new FormData();
  formData.append('image', blob, 'webcam_frame.jpg');
  formData.append('conf_threshold', AppConfig.confThreshold);
  formData.append('iou_threshold',  AppConfig.iouThreshold);
  formData.append('max_det',        AppConfig.maxDetections);

  console.log('Sending webcam request to:', `${AppConfig.backendUrl}/webcam-detect`);
  const response = await fetch(`${AppConfig.backendUrl}/webcam-detect`, {
    method: 'POST',
    body: formData,
  });

  console.log('Webcam response status:', response.status);
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  const result = await response.json();
  console.log('Webcam response data:', result);
  return result;
}

// ─────────────────────────────────────────────────────────
// RENDER — Object list with confidence bars
// ─────────────────────────────────────────────────────────
function renderResults(detections) {
  if (!detections || detections.length === 0) {
    objectList.innerHTML = '<div class="object-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>No objects detected</p></div>';
    resultsCount.textContent = '0 found';
    return;
  }

  // Sort by confidence descending
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  resultsCount.textContent = `${sorted.length} found`;

  objectList.innerHTML = sorted.map(det => {
    const confPct = Math.round(det.confidence * 100);
    return `
      <div class="object-item">
        <div class="object-item-header">
          <span class="object-name">${det.class_name}</span>
          <span class="object-conf">${confPct}%</span>
        </div>
        <div class="conf-bar-track">
          <div class="conf-bar-fill" style="width: ${confPct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────
// CANVAS — Draw bounding boxes on preview
// ─────────────────────────────────────────────────────────
const BBOX_COLORS = ['#00f5a0','#00d4ff','#f5c400','#a855f7','#f04060','#ff8c42','#7fff6e'];

function clearCanvas() {
  const ctx = detectionCanvas.getContext('2d');
  ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
}

function drawBoundingBoxes(detections) {
  // Size canvas to match preview area
  const container = document.getElementById('previewArea');
  const isImage = previewImage.style.display !== 'none';
  const imgEl = isImage ? previewImage : webcamFeed;

  const cw = container.offsetWidth;
  const ch = container.offsetHeight;
  detectionCanvas.width  = cw;
  detectionCanvas.height = ch;
  detectionCanvas.style.display = 'block';  // Ensure canvas is visible

  // Wait for image to fully load if in image mode
  if (isImage && previewImage.src) {
    // For images with object-fit:contain, we need to account for the actual display size
    const imgW = previewImage.naturalWidth || cw;
    const imgH = previewImage.naturalHeight || ch;
    
    // Calculate the actual displayed dimensions (object-fit: contain)
    const containerAspect = cw / ch;
    const imageAspect = imgW / imgH;
    let displayW, displayH;
    
    if (imageAspect > containerAspect) {
      // Image is wider - limited by container width
      displayW = cw;
      displayH = cw / imageAspect;
    } else {
      // Image is taller - limited by container height
      displayH = ch;
      displayW = ch * imageAspect;
    }
    
    const offsetX = (cw - displayW) / 2;
    const offsetY = (ch - displayH) / 2;
    
    const scaleX = displayW / imgW;
    const scaleY = displayH / imgH;
    
    drawBoxes(detections, offsetX, offsetY, scaleX, scaleY);
  } else {
    // For webcam, scale directly
    const imgW = imgEl.videoWidth || cw;
    const imgH = imgEl.videoHeight || ch;
    const scaleX = cw / imgW;
    const scaleY = ch / imgH;
    
    drawBoxes(detections, 0, 0, scaleX, scaleY);
  }
}

function drawBoxes(detections, offsetX, offsetY, scaleX, scaleY) {
  const ctx = detectionCanvas.getContext('2d');
  ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);

  if (!detections || detections.length === 0) return;

  detections.forEach((det, idx) => {
    const color = BBOX_COLORS[idx % BBOX_COLORS.length];
    const { x1, y1, x2, y2, class_name, confidence } = det;

    const rx = offsetX + (x1 * scaleX);
    const ry = offsetY + (y1 * scaleY);
    const rw = (x2 - x1) * scaleX;
    const rh = (y2 - y1) * scaleY;

    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    // Draw label background
    const label  = `${class_name} ${Math.round(confidence * 100)}%`;
    ctx.font     = 'bold 12px DM Mono, monospace';
    const tm = ctx.measureText(label);
    const tw = tm.width;
    ctx.fillStyle = color;
    ctx.fillRect(rx - 1, ry - 20, tw + 10, 20);

    // Draw label text
    ctx.fillStyle = '#080c10';
    ctx.fillText(label, rx + 4, ry - 5);
  });
}

// ─────────────────────────────────────────────────────────
// METRICS — Update dashboard stat cards
// ─────────────────────────────────────────────────────────
let allTimeDetections = parseInt(localStorage.getItem('allTimeDetections') || '0');
let allTimeClasses    = JSON.parse(localStorage.getItem('allTimeClasses') || '[]');
let allTimeConfs      = JSON.parse(localStorage.getItem('allTimeConfs')   || '[]');

function updateMetrics(detections) {
  allTimeDetections += detections.length;

  // Track unique class names
  detections.forEach(d => {
    if (!allTimeClasses.includes(d.class_name)) allTimeClasses.push(d.class_name);
    allTimeConfs.push(d.confidence);
  });

  // Persist in localStorage for session continuity
  localStorage.setItem('allTimeDetections', allTimeDetections);
  localStorage.setItem('allTimeClasses',    JSON.stringify(allTimeClasses));
  localStorage.setItem('allTimeConfs',      JSON.stringify(allTimeConfs));

  const avgConf = allTimeConfs.length > 0
    ? Math.round((allTimeConfs.reduce((a, b) => a + b, 0) / allTimeConfs.length) * 100) + '%'
    : '—';

  metricDetections.textContent = allTimeDetections;
  metricClasses.textContent    = allTimeClasses.length;
  metricAvgConf.textContent    = avgConf;
  metricSessions.textContent   = sessionCount;

  sidebarTotalDetections.textContent = allTimeDetections;
  sidebarTotalClasses.textContent    = allTimeClasses.length;
}

// Load persisted metrics on page load
function initMetrics() {
  const avgConf = allTimeConfs.length > 0
    ? Math.round((allTimeConfs.reduce((a, b) => a + b, 0) / allTimeConfs.length) * 100) + '%'
    : '—';
  metricDetections.textContent = allTimeDetections;
  metricClasses.textContent    = allTimeClasses.length;
  metricAvgConf.textContent    = avgConf;
  metricSessions.textContent   = 0;
  sidebarTotalDetections.textContent = allTimeDetections;
  sidebarTotalClasses.textContent    = allTimeClasses.length;
}

// ─────────────────────────────────────────────────────────
// LOG — Append entry to the detection log panel
// ─────────────────────────────────────────────────────────
function appendLog(type, message) {
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const typeClass  = type === 'image' ? 'log-type-img' : 'log-type-cam';
  const typeLabel  = type === 'image' ? '[IMG]' : '[CAM]';

  // Remove placeholder text
  const placeholder = detectionLog.querySelector('.log-empty');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${now}</span><span class="${typeClass}">${typeLabel}</span> ${message}`;

  detectionLog.insertBefore(entry, detectionLog.firstChild);

  // Keep log to last 20 entries
  while (detectionLog.children.length > 20) {
    detectionLog.removeChild(detectionLog.lastChild);
  }
}

// ─────────────────────────────────────────────────────────
// HISTORY PAGE — Fetch and render from backend
// ─────────────────────────────────────────────────────────
let allHistoryData = [];

async function loadHistory() {
  try {
    const res = await fetch(`${AppConfig.backendUrl}/history`);
    if (!res.ok) throw new Error('Failed to fetch history');
    const data = await res.json();
    allHistoryData = data.history || [];
    populateClassFilter(allHistoryData);
    renderHistory(allHistoryData);
  } catch (err) {
    historyTableBody.innerHTML = `<tr><td colspan="5" class="table-empty">Could not load history: ${err.message}</td></tr>`;
  }
}

function populateClassFilter(records) {
  const classes = new Set();
  records.forEach(r => {
    const objs = Array.isArray(r.detected_objects) ? r.detected_objects : JSON.parse(r.detected_objects || '[]');
    objs.forEach(c => classes.add(c));
  });
  historyFilter.innerHTML = '<option value="">All Classes</option>' +
    [...classes].sort().map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderHistory(records) {
  currentPage = 1;
  const filtered = filterHistory(records);
  renderTablePage(filtered, currentPage);
  renderPagination(filtered.length);
}

function filterHistory(records) {
  const search = historySearch.value.toLowerCase().trim();
  const cls    = historyFilter.value;

  return records.filter(r => {
    const objs = Array.isArray(r.detected_objects)
      ? r.detected_objects
      : JSON.parse(r.detected_objects || '[]');

    const matchSearch = !search || objs.some(o => o.toLowerCase().includes(search));
    const matchClass  = !cls    || objs.includes(cls);
    return matchSearch && matchClass;
  });
}

function renderTablePage(records, page) {
  const start = (page - 1) * ROWS_PER_PAGE;
  const slice = records.slice(start, start + ROWS_PER_PAGE);

  if (slice.length === 0) {
    historyTableBody.innerHTML = '<tr><td colspan="5" class="table-empty">No records found.</td></tr>';
    return;
  }

  historyTableBody.innerHTML = slice.map(r => {
    const objs  = Array.isArray(r.detected_objects) ? r.detected_objects : JSON.parse(r.detected_objects || '[]');
    const confs = Array.isArray(r.confidence_scores) ? r.confidence_scores : JSON.parse(r.confidence_scores || '[]');

    const tags     = objs.map(o => `<span class="tag">${o}</span>`).join('');
    const confText = confs.map(c => `${Math.round(c * 100)}%`).join(', ') || '—';

    const thumbHtml = r.image_path
      ? `<img src="${AppConfig.backendUrl}/uploads/${r.image_path.split('/').pop()}" class="thumb-img" alt="thumb" onerror="this.outerHTML='<div class=thumb-placeholder>No img</div>'">`
      : '<div class="thumb-placeholder">No img</div>';

    return `
      <tr>
        <td>${thumbHtml}</td>
        <td>${tags || '—'}</td>
        <td><span class="conf-text">${confText}</span></td>
        <td><span class="timestamp-text">${formatTimestamp(r.timestamp)}</span></td>
        <td><button class="delete-btn" onclick="deleteRecord(${r.id})">Delete</button></td>
      </tr>`;
  }).join('');
}

function renderPagination(totalRecords) {
  const totalPages = Math.ceil(totalRecords / ROWS_PER_PAGE);
  const pag = document.getElementById('pagination');

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  pag.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(p => `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`)
    .join('');
}

function goToPage(page) {
  currentPage = page;
  const filtered = filterHistory(allHistoryData);
  renderTablePage(filtered, page);
  renderPagination(filtered.length);
}

// Filter change events
historySearch.addEventListener('input',  () => renderHistory(allHistoryData));
historyFilter.addEventListener('change', () => renderHistory(allHistoryData));
document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);

// ─────────────────────────────────────────────────────────
// HISTORY — Delete a record
// ─────────────────────────────────────────────────────────
async function deleteRecord(id) {
  if (!confirm('Delete this detection record?')) return;
  try {
    const res = await fetch(`${AppConfig.backendUrl}/history/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Record deleted');
    loadHistory();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────
// HISTORY — Export as CSV
// ─────────────────────────────────────────────────────────
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (allHistoryData.length === 0) {
    showToast('No data to export', 'warning');
    return;
  }

  const headers = ['ID', 'Image Path', 'Detected Objects', 'Confidence Scores', 'Timestamp'];
  const rows = allHistoryData.map(r => {
    const objs  = Array.isArray(r.detected_objects) ? r.detected_objects.join('; ') : r.detected_objects;
    const confs = Array.isArray(r.confidence_scores) ? r.confidence_scores.join('; ') : r.confidence_scores;
    return [r.id, r.image_path, objs, confs, r.timestamp].map(v => `"${v}"`).join(',');
  });

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `yolo_detections_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully');
});

// ─────────────────────────────────────────────────────────
// ANALYTICS PAGE — Charts using Chart.js
// ─────────────────────────────────────────────────────────
let classChartInstance = null;
let confChartInstance  = null;
let timeChartInstance  = null;

const chartDefaults = {
  color: '#6a8aa8',
  borderColor: '#1e2d3d',
  font: { family: 'DM Mono, monospace', size: 11 },
};

async function loadAnalytics() {
  try {
    const res = await fetch(`${AppConfig.backendUrl}/history`);
    if (!res.ok) throw new Error('Failed to fetch analytics data');
    const data = await res.json();
    buildAnalyticsCharts(data.history || []);
  } catch (err) {
    console.warn('Analytics data fetch error:', err.message);
    // Show empty charts if backend is unavailable
    buildAnalyticsCharts([]);
  }
}

function buildAnalyticsCharts(records) {
  // ── Class distribution ──
  const classCounts = {};
  records.forEach(r => {
    const objs = Array.isArray(r.detected_objects) ? r.detected_objects : JSON.parse(r.detected_objects || '[]');
    objs.forEach(o => { classCounts[o] = (classCounts[o] || 0) + 1; });
  });

  const classLabels = Object.keys(classCounts);
  const classValues = Object.values(classCounts);

  if (classChartInstance) classChartInstance.destroy();
  classChartInstance = new Chart(document.getElementById('classChart'), {
    type: 'bar',
    data: {
      labels: classLabels,
      datasets: [{
        label: 'Detections',
        data: classValues,
        backgroundColor: 'rgba(0,245,160,0.3)',
        borderColor: '#00f5a0',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: chartDefaults, grid: { color: '#1e2d3d' } },
        y: { ticks: chartDefaults, grid: { color: '#1e2d3d' }, beginAtZero: true },
      }
    }
  });

  // ── Confidence distribution (histogram) ──
  const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
  records.forEach(r => {
    const confs = Array.isArray(r.confidence_scores) ? r.confidence_scores : JSON.parse(r.confidence_scores || '[]');
    confs.forEach(c => {
      const pct = c * 100;
      if (pct <= 20) buckets['0-20']++;
      else if (pct <= 40) buckets['21-40']++;
      else if (pct <= 60) buckets['41-60']++;
      else if (pct <= 80) buckets['61-80']++;
      else buckets['81-100']++;
    });
  });

  if (confChartInstance) confChartInstance.destroy();
  confChartInstance = new Chart(document.getElementById('confChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: ['#f04060','#f5c400','#00d4ff','#a855f7','#00f5a0'],
        borderColor: '#111820',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#6a8aa8', font: chartDefaults.font, padding: 14 } }
      }
    }
  });

  // ── Detections over time (by date) ──
  const byDate = {};
  records.forEach(r => {
    const day = r.timestamp.split('T')[0] || r.timestamp.split(' ')[0];
    byDate[day] = (byDate[day] || 0) + 1;
  });

  const sortedDates = Object.keys(byDate).sort();
  if (timeChartInstance) timeChartInstance.destroy();
  timeChartInstance = new Chart(document.getElementById('timeChart'), {
    type: 'line',
    data: {
      labels: sortedDates,
      datasets: [{
        label: 'Detections',
        data: sortedDates.map(d => byDate[d]),
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.08)',
        pointBackgroundColor: '#00d4ff',
        pointRadius: 4,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: chartDefaults, grid: { color: '#1e2d3d' } },
        y: { ticks: chartDefaults, grid: { color: '#1e2d3d' }, beginAtZero: true },
      }
    }
  });
}

// ─────────────────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────────────────
const confSlider    = document.getElementById('confThreshold');
const confValLabel  = document.getElementById('confThresholdVal');
const iouSlider     = document.getElementById('iouThreshold');
const iouValLabel   = document.getElementById('iouThresholdVal');

// Set initial slider values from config
confSlider.value   = Math.round(AppConfig.confThreshold * 100);
confValLabel.textContent = confSlider.value + '%';
iouSlider.value    = Math.round(AppConfig.iouThreshold * 100);
iouValLabel.textContent  = iouSlider.value + '%';
document.getElementById('maxDetections').value = AppConfig.maxDetections;
document.getElementById('backendUrl').value     = AppConfig.backendUrl;
document.getElementById('modelPath').value      = AppConfig.modelPath;

confSlider.addEventListener('input', () => { confValLabel.textContent = confSlider.value + '%'; });
iouSlider.addEventListener('input',  () => { iouValLabel.textContent  = iouSlider.value  + '%'; });

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  AppConfig.confThreshold = parseInt(confSlider.value) / 100;
  AppConfig.iouThreshold  = parseInt(iouSlider.value)  / 100;
  AppConfig.maxDetections = parseInt(document.getElementById('maxDetections').value);
  AppConfig.backendUrl    = document.getElementById('backendUrl').value.trim();
  AppConfig.modelPath     = document.getElementById('modelPath').value.trim();

  // Persist settings
  localStorage.setItem('confThreshold', AppConfig.confThreshold);
  localStorage.setItem('iouThreshold',  AppConfig.iouThreshold);
  localStorage.setItem('maxDetections', AppConfig.maxDetections);
  localStorage.setItem('backendUrl',    AppConfig.backendUrl);
  localStorage.setItem('modelPath',     AppConfig.modelPath);

  showToast('Settings saved successfully');
});

// ─────────────────────────────────────────────────────────
// INIT — Run on page load
// ─────────────────────────────────────────────────────────
(function init() {
  initMetrics();
  setStatus('Ready');
})();
