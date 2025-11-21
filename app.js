    const API_BASE = 'https://script.google.com/macros/s/AKfycbyJdmffRh-Ip4Rs1UUWgV0nJLyF1hdRItaropGm6KMqyiKu_fUQh2BaRntV0w5JJF4/exec'; 

    let currentScreen = 'home';
    let currentEquipmentId = null;
    let currentExtinguisher = null;
    let inspectionData = {};
    let allInspections = [];
    let videoStream = null;

    // ========== Helper เรียก API ==========

    async function fetchExtinguisherById(id) {
      try {
        const res = await fetch(`${API_BASE}?action=getExtinguisher&id=${encodeURIComponent(id)}`);
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
          if (currentScreen === 'history') {
            renderHistory();
          }
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

    // ========== Navigation ==========

    function navigateToScreen(screenName) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

      const screenMap = {
        home: 'home-screen',
        scan: 'scan-screen',
        history: 'history-screen',
        profile: 'home-screen'
      };

      const targetScreen = screenMap[screenName] || 'home-screen';
      document.getElementById(targetScreen).classList.add('active');

      document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.screen === screenName) {
          item.classList.add('active');
        }
      });

      currentScreen = screenName;

      if (screenName === 'history') {
        renderHistory();
      }
    }

    // ========== QR Scanner ==========

    async function openQRScanner() {
      stopQRScanner();
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('scan-screen').classList.add('active');
      currentScreen = 'scan';

      const video = document.getElementById('qr-video');
      const scanStatus = document.getElementById('scan-status');

      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });

        video.srcObject = videoStream;
        video.setAttribute('playsinline', true);
        await video.play();

        scanStatus.textContent = 'Scanning...';
        requestAnimationFrame(scanQRFrame);
      } catch (e) {
        console.error(e);
        scanStatus.textContent = 'Camera error or permission denied';
      }
    }

    function scanQRFrame() {
      const video = document.getElementById('qr-video');

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          handleScanResult(code.data);
          return;
        }
      }

      if (currentScreen === 'scan') {
        requestAnimationFrame(scanQRFrame);
      }
    }

    async function handleScanResult(qrText) {
      const id = qrText.trim();
      const scanStatus = document.getElementById('scan-status');
      scanStatus.textContent = 'Checking ID: ' + id + ' ...';

      stopQRScanner();

      const extinguisher = await fetchExtinguisherById(id);
      if (!extinguisher) {
        alert('QR not recognized or not in database: ' + id);
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

    // ========== Detail / Inspection / Result / History ==========

    function showDetailScreen(extinguisher) {
      if (!extinguisher) return;

      document.getElementById('detail-equipment-id').textContent = extinguisher.id;
      document.getElementById('detail-location').textContent = extinguisher.location || '-';
      document.getElementById('detail-type').textContent = extinguisher.type || '-';
      document.getElementById('detail-size').textContent = extinguisher.size || '-';
      document.getElementById('detail-last-inspection').textContent = extinguisher.lastInspection || '-';
      document.getElementById('detail-expiry').textContent = extinguisher.expiry || '-';

      const statusBadge = document.getElementById('detail-status');
      statusBadge.textContent = extinguisher.status || '-';
      statusBadge.className = 'badge';
      if (extinguisher.status === 'Good') {
        statusBadge.classList.add('badge-good');
      } else if (extinguisher.status === 'Need Service') {
        statusBadge.classList.add('badge-service');
      } else {
        statusBadge.classList.add('badge-expired');
      }

      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('detail-screen').classList.add('active');
      currentScreen = 'detail';
    }

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

      document.getElementById('inspector-name').value = '';
      document.getElementById('remarks').value = '';
      document.getElementById('inspection-equipment-id').textContent = currentEquipmentId || '-';

      document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active-yes', 'active-no', 'active-na');
      });

      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('inspection-screen').classList.add('active');
      currentScreen = 'inspection';

      updateSubmitButton();
    }

    function updateSubmitButton() {
      const allAnswered = Object.values(inspectionData).every(val => val !== null);
      const inspectorName = document.getElementById('inspector-name').value.trim();
      const submitBtn = document.getElementById('submit-inspection-btn');

      submitBtn.disabled = !(allAnswered && inspectorName);
    }

    async function submitInspection() {
      const inspectorName = document.getElementById('inspector-name').value.trim();
      const remarks = document.getElementById('remarks').value.trim();

      const failCount = Object.values(inspectionData).filter(v => v === 'no').length;
      const result = failCount === 0 ? 'Pass' : 'Fail';

      const submitBtn = document.getElementById('submit-inspection-btn');
      const submitBtnText = document.getElementById('submit-btn-text');
      submitBtn.disabled = true;
      submitBtnText.textContent = 'Submitting...';

const inspectionRecord = {
  inspection_date: new Date().toISOString(),   // <<<<<< สำคัญมาก ต้องมี!

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


      try {
        const serverResult = await submitInspectionToServer(inspectionRecord);

        if (serverResult.success) {
          allInspections.push(inspectionRecord);
          updateStats();
          showResultScreen(result, inspectorName);
        } else {
          submitBtnText.textContent = 'Error - Try Again';
          setTimeout(() => {
            submitBtnText.textContent = 'Submit Inspection';
            submitBtn.disabled = false;
          }, 2000);
        }
      } catch (err) {
        console.error(err);
        submitBtnText.textContent = 'Error - Try Again';
        setTimeout(() => {
          submitBtnText.textContent = 'Submit Inspection';
          submitBtn.disabled = false;
        }, 2000);
      }
    }

    function showResultScreen(result, inspectorName) {
      const resultIcon = document.getElementById('result-icon');
      const resultTitle = document.getElementById('result-title');
      const resultSubtitle = document.getElementById('result-subtitle');

      if (result === 'Pass') {
        resultIcon.className = 'result-icon result-pass';
        resultIcon.textContent = '✓';
        resultTitle.textContent = 'Inspection Complete';
        resultSubtitle.textContent = 'Equipment passed all safety checks';
      } else {
        resultIcon.className = 'result-icon result-fail';
        resultIcon.textContent = '✗';
        resultTitle.textContent = 'Service Required';
        resultSubtitle.textContent = 'Equipment requires maintenance';
      }

      document.getElementById('result-equipment-id').textContent = currentEquipmentId || '-';
      document.getElementById('result-inspector').textContent = inspectorName || '-';
      document.getElementById('result-timestamp').textContent = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      document.getElementById('result-status').textContent = result;

      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('result-screen').classList.add('active');
      currentScreen = 'result';
    }

    function renderHistory() {
      const historyList = document.getElementById('history-list');
      const historyEmpty = document.getElementById('history-empty');

      if (allInspections.length === 0) {
        historyList.innerHTML = '';
        historyEmpty.style.display = 'block';
        return;
      }

      historyEmpty.style.display = 'none';

      const sortedInspections = [...allInspections].sort((a, b) =>
        new Date(b.inspection_date) - new Date(a.inspection_date)
      );

      historyList.innerHTML = sortedInspections.map(inspection => {
        const date = new Date(inspection.inspection_date);
        const formattedDate = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        const badgeClass = inspection.result === 'Pass' ? 'badge-good' : 'badge-service';

        return `
          <div class="history-item">
            <div class="history-header">
              <span class="history-id">${inspection.equipment_id}</span>
              <span class="badge ${badgeClass}">${inspection.result}</span>
            </div>
            <div class="history-inspector">Inspector: ${inspection.inspector_name}</div>
            <div class="history-date">${formattedDate}</div>
          </div>
        `;
      }).join('');
    }

    function updateStats() {
      const today = new Date().toDateString();
      const todayInspections = allInspections.filter(i =>
        new Date(i.inspection_date).toDateString() === today
      );

      document.getElementById('today-count').textContent = todayInspections.length;
      document.getElementById('total-count').textContent = allInspections.length;
    }

    // ========== Event Listeners ==========

    document.getElementById('scan-btn').addEventListener('click', openQRScanner);

    document.getElementById('start-inspection-btn').addEventListener('click', startInspection);

    document.getElementById('back-to-home-btn').addEventListener('click', () => {
      stopQRScanner();
      navigateToScreen('home');
    });

    document.getElementById('cancel-inspection-btn').addEventListener('click', () => {
      stopQRScanner();
      navigateToScreen('home');
    });

    document.getElementById('new-inspection-btn').addEventListener('click', () => {
      stopQRScanner();
      navigateToScreen('home');
    });

    document.getElementById('view-history-btn').addEventListener('click', () => {
      navigateToScreen('history');
    });

    document.getElementById('inspector-name').addEventListener('input', updateSubmitButton);

    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const question = btn.dataset.question;
        const value = btn.dataset.value;

        document.querySelectorAll(`.toggle-btn[data-question="${question}"]`).forEach(b => {
          b.classList.remove('active-yes', 'active-no', 'active-na');
        });

        btn.classList.add(`active-${value}`);
        inspectionData[question] = value;
        updateSubmitButton();
      });
    });

    document.getElementById('submit-inspection-btn').addEventListener('click', submitInspection);

    document.getElementById('stop-scan-btn').addEventListener('click', () => {
      stopQRScanner();
      navigateToScreen('home');
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const screen = item.dataset.screen;

        if (screen === 'scan') {
          openQRScanner();
          return;
        }

        stopQRScanner();
        navigateToScreen(screen);
      });
    });

    // ========== Init ==========

    (async function init() {
      await loadInspections();
    })();
