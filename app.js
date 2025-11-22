/************************************************************
 * FIRE EXTINGUISHER INSPECTION — FRONTEND JS (FULL 100%)
 ************************************************************/

const API_BASE =
  "https://script.google.com/macros/s/AKfycbyJdmffRh-Ip4Rs1UUWgV0nJLyF1hdRItaropGm6KMqyiKu_fUQh2BaRntV0w5JJF4/exec";

let currentScreen = "home";
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
    const res = await fetch(
      `${API_BASE}?action=getExtinguisher&id=${encodeURIComponent(id)}`
    );
    const data = await res.json();
    if (!data.success) return null;
    return data.extinguisher;
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
      allInspections = data.inspections || [];
      updateStats();
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitInspectionToServer(record) {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submitInspection",
        payload: record,
      }),
    });
    return res.json();
  } catch (err) {
    console.error(err);
    return { success: false };
  }
}

/************************************************************
 * NAVIGATION
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
    profile: "profile-screen"
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

    scanStatus.textContent = "Scanning...";
    requestAnimationFrame(scanQRFrame);
  } catch (err) {
    scanStatus.textContent = "Camera error";
  }
}

function scanQRFrame() {
  const video = document.getElementById("qr-video");

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
  const extinguisher = await fetchExtinguisherById(id);

  if (!extinguisher) {
    alert("ID not found: " + id);
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
 * DETAIL SCREEN
 ************************************************************/

function showDetailScreen(ext) {
  document.getElementById("detail-equipment-id").textContent = ext.id;
  document.getElementById("detail-location").textContent = ext.location;
  document.getElementById("detail-type").textContent = ext.type;
  document.getElementById("detail-size").textContent = ext.size;
  document.getElementById("detail-last-inspection").textContent = ext.lastInspection;
  document.getElementById("detail-expiry").textContent = ext.expiryDate;

  navigateToScreen("detail");
}

/************************************************************
 * INSPECTION
 ************************************************************/

function startInspection() {
  inspectionData = {
    pressure_ok: null,
    no_damage: null,
    seal_intact: null,
    label_readable: null,
    weight_ok: null,
    hose_ok: null,
    expiry_valid: null,
  };

  document.getElementById("inspector-name").value = "";
  document.getElementById("remarks").value = "";
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.remove("active-yes", "active-no");
  });

  document.getElementById("inspection-equipment-id").textContent =
    currentEquipmentId;

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
  const inspectorName = document.getElementById("inspector-name").value.trim();
  const remarks = document.getElementById("remarks").value.trim();

  const failCount =
    Object.values(inspectionData).filter((v) => v === "no").length;

  const result = failCount === 0 ? "Pass" : "Fail";

  const record = {
    equipment_id: currentEquipmentId,
    inspector_name: inspectorName,
    ...inspectionData,
    remarks: remarks,
    result: result,
  };

  const res = await submitInspectionToServer(record);

  if (!res.success) {
    alert("Error saving inspection");
    return;
  }

  allInspections.push({
    ...record,
    timestamp: new Date().toISOString(),
  });

  updateStats();
  showResultScreen(result, inspectorName);
}

/************************************************************
 * RESULT SCREEN
 ************************************************************/

function showResultScreen(result, inspector) {
  document.getElementById("result-equipment-id").textContent = currentEquipmentId;
  document.getElementById("result-status").textContent = result;
  document.getElementById("result-inspector").textContent = inspector;
  document.getElementById("result-timestamp").textContent =
    new Date().toLocaleString();

  navigateToScreen("result");
}

/************************************************************
 * HISTORY
 ************************************************************/

function renderHistory() {
  const container = document.getElementById("history-list");

  if (!allInspections || allInspections.length === 0) {
    container.innerHTML = "<div>No inspections yet</div>";
    return;
  }

  container.innerHTML = allInspections
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map(
      (i) => `
      <div class="history-item">
        <div><b>${i.equipment_id}</b> — ${i.result}</div>
        <div>${i.inspector_name}</div>
        <div>${new Date(i.timestamp).toLocaleString()}</div>
      </div>
    `
    )
    .join("");
}


/************************************************************
 * STATS
 ************************************************************/

function updateStats() {
  const today = new Date().toDateString();
  const todayCount = allInspections.filter(
    (i) =>
      new Date(i.timestamp).toDateString() === today
  ).length;

  document.getElementById("today-count").textContent = todayCount;
  document.getElementById("total-count").textContent =
    allInspections.length;
}

/************************************************************
 * INIT
 ************************************************************/

(async function init() {
  await loadInspections();
  // เริ่มต้นที่หน้า home
  navigateToScreen("home");
})();



/************************************************************
 * TOGGLE BUTTON HANDLER
 ************************************************************/

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.question;
    const value = btn.dataset.value;

    document
      .querySelectorAll(`.toggle-btn[data-question="${q}"]`)
      .forEach((b) =>
        b.classList.remove("active-yes", "active-no")
      );

    btn.classList.add(value === "yes" ? "active-yes" : "active-no");

    inspectionData[
      q === "pressure"
        ? "pressure_ok"
        : q === "damage"
        ? "no_damage"
        : q === "seal"
        ? "seal_intact"
        : q === "label"
        ? "label_readable"
        : q === "weight"
        ? "weight_ok"
        : q === "hose"
        ? "hose_ok"
        : "expiry_valid"
    ] = value;

    updateSubmitButton();
  });
});

/************************************************************
 * BOTTOM NAV
 ************************************************************/

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-item")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const screen = btn.dataset.screen;
    navigateToScreen(screen);
  });
});

/************************************************************
 * BUTTON EVENTS
 ************************************************************/

document.getElementById("scan-btn").addEventListener("click", openQRScanner);
document.getElementById("stop-scan-btn").addEventListener("click", () => {
  stopQRScanner();
  navigateToScreen("home");
});

document
  .getElementById("start-inspection-btn")
  .addEventListener("click", startInspection);

document
  .getElementById("back-to-home-btn")
  .addEventListener("click", () => navigateToScreen("home"));

document
  .getElementById("submit-inspection-btn")
  .addEventListener("click", submitInspection);

document
  .getElementById("cancel-inspection-btn")
  .addEventListener("click", () => navigateToScreen("detail"));

document
  .getElementById("new-inspection-btn")
  .addEventListener("click", () => navigateToScreen("home"));

document
  .getElementById("view-history-btn")
  .addEventListener("click", () => navigateToScreen("history"));
