/************************************************************
 * FIRE EXTINGUISHER INSPECTION — FRONTEND JS
 ************************************************************/

const API_BASE = 'https://script.google.com/macros/s/AKfycbyJdmffRh-Ip4Rs1UUWgV0nJLyF1hdRItaropGm6KMqyiKu_fUQh2BaRntV0w5JJF4/exec';

let currentScreen = 'home';
let currentEquipmentId = null;
let currentExtinguisher = null;
let inspectionData = {};
let allInspections = [];
let videoStream = null;

/************************************************************
 * API HELPERS
 ************************************************************/

async function fetchExtinguisherById(id) {
  try {
    const res = await fetch(`${API_BASE}?action=getExtinguisher&id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data.success) return null;
    return data.extinguisher;
  } catch (err) {
    return null;
  }
}

async function loadInspections() {
  try {
    const res = await fetch(`${API_BASE}?action=getInspections`);
    const data = await res.json();
    if (data.success) {
      allInspections = data.inspections || [];
      updateStats();
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitInspectionToServer(record) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'submitInspection',
      payload: record
    })
  });

  return res.json();
}

/************************************************************
 * NAVIGATION
 ************************************************************/

function navigateToScreen(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  const screenMap = {
    home: 'home-screen',
    scan: 'scan-screen',
    history: 'history-screen',
    profile: 'home-screen'
  };

  document.getElementById(screenMap[screenName]).classList.add('active');
  currentScreen = screenName;

  if (screenName === 'history') renderHistory();
}

/************************************************************
 * QR SCAN
 ************************************************************/

async function openQRScanner() {
  stopQRScanner();
  navigateToScreen('scan');

  const video = document.getElementById('qr-video');
  const scanStatus = document.getElementById('scan-status');

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });

    video.srcObject = videoStream;
    video.setAttribute('playsinline', true);
    await video.play();

    scanStatus.textContent = "Scanning...";
    requestAnimationFrame(scanQRFrame);

  } catch (err) {
    scanStatus.textContent = "Camera error";
  }
}

function scanQRFrame() {
  const video = document.getElementById('qr-video');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, canvas.width, canvas.height);

    if (code) {
      stopQRScanner();
      handleScanResult(code.data);
      return;
    }
  }

  if (currentScreen === "scan") requestAnimationFrame(scanQRFrame);
}

async function handleScanResult(text) {
  const id = text.trim();
  const scanStatus = document.getElementById('scan-status');
  scanStatus.textContent = `Checking ${id} ...`;

  const extinguisher = await fetchExtinguisherById(id);

  if (!extinguisher) {
    alert("ID not found: " + id);
    navigateToScreen('home');
    return;
  }

  currentExtinguisher = extinguisher;
  currentEquipmentId = extinguisher.id;
  showDetailScreen(extinguisher);
}

function stopQRScanner() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
}

/************************************************************
 * DETAIL
 ************************************************************/

function showDetailScreen(ext) {
  document.getElementById("detail-equipment-id").textContent = ext.id;
  document.getElementById("detail-location").textContent = ext.location;
  document.getElementById("detail-type").textContent = ext.type;
  document.getElementById("detail-size").textContent = ext.size;
  document.getElementById("detail-last-inspection").textContent = ext.lastInspection;
  document.getElementById("detail-expiry").textContent = ext.expiry;

  navigateToScreen("detail");
}

/************************************************************
 * INSPECTION
 ************************************************************/

function startInspection() {
  inspectionData = {
    pressure: null,
    damage: null,
    seal: null,
    label: null,
    weight: null,
    hose: null,
    expiry: null
  };

  document.getElementById("inspector-name").value = "";
  document.getElementById("remarks").value = "";
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.classList.remove("active-yes", "active-no");
  });

  document.getElementById("inspection-equipment-id").textContent = currentEquipmentId;

  navigateToScreen("inspection");
}

function updateSubmitButton() {
  const allFilled = Object.values(inspectionData).every(v => v !== null);
  const inspectorName = document.getElementById("inspector-name").value.trim();

  document.getElementById("submit-inspection-btn").disabled = !(allFilled && inspectorName);
}

async function submitInspection() {
  const inspectorName = document.getElementById("inspector-name").value.trim();
  const remarks = document.getElementById("remarks").value.trim();

  const failCount = Object.values(inspectionData).filter(v => v === "no").length;
  const result = failCount === 0 ? "Pass" : "Fail";

  const record = {
    inspection_date: new Date().toISOString(),
    equipment_id: currentEquipmentId,
    inspector_name: inspectorName,

    pressure_ok: inspectionData.pressure,
    no_damage: inspectionData.damage,
    seal_intact: inspectionData.seal,
    label_readable: inspectionData.label,
    weight_ok: inspectionData.weight,
    hose_ok: inspectionData.hose,
    expiry_valid: inspectionData.expiry,

    remarks: remarks,
    result: result
  };

  const res = await submitInspectionToServer(record);

  if (!res.success) {
    alert("Error saving inspection");
    return;
  }

  allInspections.push(record);
  updateStats();
  showResultScreen(result, inspectorName);
}

/************************************************************
 * RESULT
 ************************************************************/

function showResultScreen(result, inspector) {
  document.getElementById("result-equipment-id").textContent = currentEquipmentId;
  document.getElementById("result-status").textContent = result;
  document.getElementById("result-inspector").textContent = inspector;

  navigateToScreen("result");
}

/************************************************************
 * HISTORY
 ************************************************************/

function renderHistory() {
  const container = document.getElementById("history-list");

  if (allInspections.length === 0) {
    container.innerHTML = "<div>No inspections yet</div>";
    return;
  }

  container.innerHTML = allInspections
    .sort((a, b) => new Date(b.inspection_date) - new Date(a.inspection_date))
    .map(i => `
      <div class="history-item">
        <div><b>${i.equipment_id}</b> — ${i.result}</div>
        <div>${i.inspector_name}</div>
        <div>${new Date(i.inspection_date).toLocaleString()}</div>
      </div>
    `)
    .join("");
}

/************************************************************
 * STATS
 ************************************************************/

function updateStats() {
  const today = new Date().toDateString();
  const todayCount = allInspections.filter(i => new Date(i.inspection_date).toDateString() === today).length;

  document.getElementById("today-count").textContent = todayCount;
  document.getElementById("total-count").textContent = allInspections.length;
}

/************************************************************
 * INIT
 ************************************************************/

(async function init() {
  await loadInspections();
})();

/************************************************************
 * EVENT LISTENERS
 ************************************************************/

document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.question;
    const value = btn.dataset.value;

    document.querySelectorAll(`.toggle-btn[data-question="${q}"]`)
      .forEach(b => b.classList.remove("active-yes", "active-no"));

    btn.classList.add(value === "yes" ? "active-yes" : "active-no");

    inspectionData[q] = value;
    updateSubmitButton();
  });
});
