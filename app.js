/************************************************************
 * FIRE EXTINGUISHER INSPECTION — FRONTEND JS (FULL 100%)
 ************************************************************/

const API_BASE =
  "https://script.google.com/macros/s/AKfycbzwDTU7fq_XRts-l0MOOBUZLye8MwiRysNkjEV8EceGDyLX5ZpyoJertS98Kq3YhixYDA/exec";

let currentScreen = "home";
let currentEquipmentId = null;
let currentExtinguisher = null;
let inspectionData = {};
let allInspections = [];
let videoStream = null;
let extinguisherList = [];

/************************************************************
 * HELPERS
 ************************************************************/
function formatDateTH(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;

  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function parseDateSafe(str) {
  if (!str) return null;
  if (str.includes("/")) {
    const [d, m, y] = str.split("/");
    return new Date(`${y}-${m}-${d}`);
  }
  if (!isNaN(new Date(str))) return new Date(str);
  return null;
}

function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showExtLoading() {
  document.getElementById("ext-empty").style.display = "none";

  document.getElementById("ext-list").innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    
  `;
}

/************************************************************
 * LOAD API
 ************************************************************/
async function fetchExtinguisherById(id) {
  try {
    const res = await fetch(`${API_BASE}?action=getExtinguisher&id=${id}`);
    const data = await res.json();
    return data.success ? data.extinguisher : null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function loadInspections() {
  try {
    const res = await fetch(`${API_BASE}?action=getInspections`);
    const data = await res.json();

    if (data.success) {
      allInspections = data.inspections;
    }
  } catch (err) {
    console.error("Inspection Load Error:", err);
  }
}

async function loadAllExtinguishers() {
  showLoading("กำลังโหลดข้อมูลถังดับเพลิง...");
  try {
    const res = await fetch(`${API_BASE}?action=getExtinguishers`);
    const data = await res.json();

    if (data.success) {
      extinguisherList = data.extinguishers;
      renderExtinguisherList(extinguisherList);
    }
  } catch (err) {
    console.error("Load Extinguishers Error:", err);
  }
  hideLoading();
}

/************************************************************
 * SCREENS
 ************************************************************/
function navigateToScreen(screenName) {
  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.remove("active")
  );

  const screenMap = {
    home: "home-screen",
    scan: "scan-screen",
    detail: "detail-screen",
    inspection: "inspection-screen",
    result: "result-screen",
    history: "history-screen",
    profile: "profile-screen",
    "all-ext": "all-ext-screen",
  };

  const target = document.getElementById(screenMap[screenName]);
  if (target) {
    target.classList.add("active");
    currentScreen = screenName;
  }

  if (screenName === "history") renderHistory();
}

/************************************************************
 * QR SCAN
 ************************************************************/
async function openQRScanner() {
  stopQRScanner();
  navigateToScreen("scan");

  const video = document.getElementById("qr-video");
  const scanStatus = document.getElementById("scan-status");

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });

    video.srcObject = videoStream;
    video.setAttribute("playsinline", true);
    await video.play();

    scanStatus.textContent = "กำลังสแกน...";
    requestAnimationFrame(scanQRFrame);
  } catch (err) {
    scanStatus.textContent = "ไม่สามารถเปิดกล้องได้";
  }
}

function scanQRFrame() {
  const video = document.getElementById("qr-video");

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

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
  showLoading("กำลังดึงข้อมูลอุปกรณ์...");
  
  const id = text.trim();
  const extinguisher = await fetchExtinguisherById(id);

  hideLoading();

  if (!extinguisher) {
    alert("ไม่พบหมายเลขถัง: " + id);
    navigateToScreen("home");
    return;
  }

  currentExtinguisher = extinguisher;
  currentEquipmentId = extinguisher.id;

  showDetailScreen(extinguisher);
}


function stopQRScanner() {
  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop());
    videoStream = null;
  }
}

/************************************************************
 * DETAIL
 ************************************************************/
function showDetailScreen(ext) {
  safeSet("detail-equipment-id", ext.id);
  safeSet("detail-location", ext.location);
  safeSet("detail-type", ext.type);
  safeSet("detail-size", ext.size);
  safeSet("detail-last-inspection", ext.lastInspection);
  safeSet("detail-expiry", ext.expiryDate);

  // แสดงสถานะ
  const statusEl = document.getElementById("detail-status");
  statusEl.textContent = ext.status || "-";
  statusEl.className =
    "badge " +
    (ext.status === "Good"
      ? "badge-good"
      : ext.status === "Need Service"
      ? "badge-bad"
      : "badge-warning");

  // ============ เพิ่มรูปจากชีต ===============  
    const imgEl = document.getElementById("detail-image");

    // โหลดรูปจาก root ของโปรเจกต์ เช่น E001.jpg
    if (ext.id) {
        imgEl.src = `${ext.id}.jpg`;    // 👉 รูปอยู่บน root
        imgEl.style.display = "block";
    } else {
        imgEl.style.display = "none";
    }

  navigateToScreen("detail");
}


/************************************************************
 * INSPECTION
 ************************************************************/
function startInspection() {
  inspectionData = {
    pressure_ok: null,
    seal_intact: null,
    hose_ok: null,
    expiry_valid: null,
  };

  document.getElementById("inspector-name").value = "";
  document.getElementById("remarks").value = "";

  document.querySelectorAll(".toggle-btn").forEach((btn) =>
    btn.classList.remove("active-yes", "active-no")
  );

  safeSet("inspection-equipment-id", currentEquipmentId);

  navigateToScreen("inspection");
}


function updateSubmitButton() {
  const allFilled = Object.values(inspectionData).every((v) => v !== null);
  const inspectorName = document.getElementById("inspector-name").value.trim();

  document.getElementById("submit-inspection-btn").disabled = !(
    allFilled && inspectorName
  );
}

async function submitInspection() {
  showLoading("กำลังบันทึกข้อมูล...");
  
  const inspectorName = document.getElementById("inspector-name").value.trim();
  const remarks = document.getElementById("remarks").value.trim();

  const failCount = Object.values(inspectionData).filter(
    (v) => v === "NO"
  ).length;

  const result = failCount === 0 ? "Pass" : "Fail";

  const record = {
    equipment_id: currentEquipmentId,
    inspector_name: inspectorName,
    ...inspectionData,
    remarks,
    result,
  };

  const form = new URLSearchParams();
  form.append("action", "submitInspection");
  form.append("payload", JSON.stringify(record));

  const res = await fetch(API_BASE, {
    method: "POST",
    body: form,
  }).then((r) => r.json());

  hideLoading();

  if (!res.success) {
    alert("บันทึกข้อมูลไม่สำเร็จ");
    return;
  }

  allInspections.push({ ...record, timestamp: new Date().toISOString() });

  updateDashboard();
  showResultScreen(result, inspectorName);
}

/************************************************************
 * RESULT
 ************************************************************/
function showResultScreen(result, inspector) {
  safeSet("result-equipment-id", currentEquipmentId);
  safeSet("result-status", result);
  safeSet("result-inspector", inspector);
  safeSet("result-timestamp", new Date().toLocaleString());

  navigateToScreen("result");
}

/************************************************************
 * HISTORY
 ************************************************************/
function renderHistory() {
  const box = document.getElementById("history-list");

  if (!allInspections.length) {
    box.innerHTML = "<div>ยังไม่มีประวัติ</div>";
    return;
  }

  box.innerHTML = allInspections
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((i) => {
      let statusClass =
        "status-badge " +
        (i.result === "Pass"
          ? "status-good"
          : i.result === "Fail"
          ? "status-bad"
          : "status-warn");

      return `
        <div class="history-item">
          <div class="history-header" style="display:flex; align-items:center; gap:20px;">
            <span class="history-id">${i.equipment_id}</span>
            <span class="history-date">${i.inspector_name}</span>
            <span class="${statusClass}" style="margin-left:auto;">${i.result}</span>
          </div>
          <div class="history-inspector">ตรวจวันที่: ${formatDateTH(
            i.timestamp
          )}</div>
        </div>
      `;
    })
    .join("");
}

/************************************************************
 * ALERTS
 ************************************************************/
function renderAlerts() {
  const now = new Date();
  const alert1 = [];
  const alert6 = [];

  extinguisherList.forEach((ext) => {
    if (!ext.lastInspection) return;

    const d = parseDateSafe(ext.lastInspection);
    if (!d) return;

    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));

    if (diff >= 180) {
      alert6.push(`
        <div class="alert-item">
          <span class="id">${ext.id}</span>
          <span class="days">${diff} วัน</span>
        </div>`);
    } else if (diff >= 30) {
      alert1.push(`
        <div class="alert-item">
          <span class="id">${ext.id}</span>
          <span class="days">${diff} วัน</span>
        </div>`);
    }
  });

  document.getElementById("alert-1m").innerHTML =
    alert1.length ? alert1.join("") : `<span style="opacity:.6">ไม่มี</span>`;

  document.getElementById("alert-6m").innerHTML =
    alert6.length ? alert6.join("") : `<span style="opacity:.6">ไม่มี</span>`;
}

/************************************************************
 * DASHBOARD
 ************************************************************/
function updateDashboard() {
  if (!extinguisherList.length) return;

  const now = new Date();
  const todayStr = now.toDateString();

  const today = allInspections.filter(
    (i) => new Date(i.timestamp).toDateString() === todayStr
  ).length;

  const weekAgo = new Date();
  weekAgo.setDate(now.getDate() - 7);

  const week = allInspections.filter(
    (i) => new Date(i.timestamp) >= weekAgo
  ).length;

  const monthAgo = new Date();
  monthAgo.setMonth(now.getMonth() - 1);

  const month = allInspections.filter(
    (i) => new Date(i.timestamp) >= monthAgo
  ).length;

  const total = allInspections.length;

  safeSet("sum-today", today);
  safeSet("sum-week", week);
  safeSet("sum-month", month);
  safeSet("sum-total", total);

  safeSet("sum-checked", total);
  safeSet("sum-unchecked", extinguisherList.length - total);

  renderAlerts();
}

/************************************************************
 * LIST ALL EXTINGUISHERS
 ************************************************************/
function renderExtinguisherList(list) {
  const box = document.getElementById("ext-list");
  const empty = document.getElementById("ext-empty");

  if (!list.length) {
    empty.style.display = "block";
    box.innerHTML = "";
    return;
  }

  empty.style.display = "none";

  box.innerHTML = list
    .map((e) => {
      const badge =
        e.status === "Good"
          ? "status-good"
          : e.status === "Need Service"
          ? "status-bad"
          : "status-warn";

      return `
        <div class="history-item" onclick="selectExtinguisher('${e.id}')">
          <div class="history-header" style="display:flex; align-items:center; gap:20px;">
            <span class="history-id">${e.id}</span>
            <span class="history-date">${e.type}</span>
            <span class="status-badge ${badge}" style="margin-left:auto;">${e.status}</span>
          </div>

          <div class="history-inspector">${e.location}</div>
          <div class="history-date-small">ตรวจล่าสุด: ${formatDateTH(
            e.lastInspection
          )}</div>
        </div>`;
    })
    .join("");
}

async function selectExtinguisher(id) {
  const ext = await fetchExtinguisherById(id);
  if (!ext) {
    alert("ไม่พบรหัสนี้");
    return;
  }
  currentExtinguisher = ext;
  currentEquipmentId = ext.id;
  showDetailScreen(ext);
}

/************************************************************
 * INIT
 ************************************************************/
(async function init() {
  showLoading("กำลังโหลดข้อมูลจากระบบ...");

  await loadInspections();
  await loadAllExtinguishers();
  updateDashboard();

  hideLoading();
  navigateToScreen("home");
})();


/************************************************************
 * TOGGLE BUTTONS
 ************************************************************/
document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.question;
    let value = btn.dataset.value;

    value =
      value === "yes" ? "YES" : value === "no" ? "NO" : value === "na" ? "NA" : null;

    document
      .querySelectorAll(`.toggle-btn[data-question="${q}"]`)
      .forEach((b) =>
        b.classList.remove("active-yes", "active-no")
      );

    btn.classList.add(
      value === "YES" ? "active-yes" : value === "NO" ? "active-no" : ""
    );

    const map = {
      pressure: "pressure_ok",
      seal: "seal_intact",
      hose: "hose_ok",
      expiry: "expiry_valid",
    };


    inspectionData[map[q]] = value;

    updateSubmitButton();
  });
});

/************************************************************
 * MAIN BUTTON EVENTS
 ************************************************************/
if (document.getElementById("scan-btn")) {
  document.getElementById("scan-btn").addEventListener("click", openQRScanner);
}

document
  .getElementById("stop-scan-btn")
  .addEventListener("click", () => {
    stopQRScanner();
    navigateToScreen("home");
  });

document
  .getElementById("start-inspection-btn")
  .addEventListener("click", startInspection);

document
  .getElementById("submit-inspection-btn")
  .addEventListener("click", submitInspection);

document
  .getElementById("back-to-home-btn")
  .addEventListener("click", () => navigateToScreen("home"));

document
  .getElementById("cancel-inspection-btn")
  .addEventListener("click", () => navigateToScreen("detail"));

document
  .getElementById("new-inspection-btn")
  .addEventListener("click", () => navigateToScreen("home"));

document
  .getElementById("view-history-btn")
  .addEventListener("click", () => navigateToScreen("history"));

/************************************************************
 * BOTTOM NAV — FIXED 100%
 ************************************************************/
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const screen = btn.dataset.screen;

    if (screen === "scan") return openQRScanner();

    if (screen === "all-ext") {
      navigateToScreen("all-ext");
      loadAllExtinguishers();
      return;
    }

    navigateToScreen(screen);
  });
});

/************************************************************
 * GLOBAL LOADING OVERLAY
 ************************************************************/
function showLoading(text = "กำลังโหลดข้อมูล...") {
  document.getElementById("loading-text").textContent = text;
  document.getElementById("loading-overlay").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loading-overlay").style.display = "none";
}
