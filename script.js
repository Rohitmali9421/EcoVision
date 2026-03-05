// ===================== STATE =====================
let running = false;
let muted = false;
let camera = false;
let scanTimer = null;
let countdown = 0;
let countdownTimer = null;
let intervalSec = 5;
let stream = null;
let speaking = false;

const synth = window.speechSynthesis;

// ===================== iOS SPEECH UNLOCK =====================
document.body.addEventListener('touchstart', () => {
  const unlock = new SpeechSynthesisUtterance('');
  speechSynthesis.speak(unlock);
}, { once: true });

// ===================== LOAD VOICES (iOS FIX) =====================
speechSynthesis.onvoiceschanged = () => {
  speechSynthesis.getVoices();
};

// ===================== ELEMENTS =====================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const statusDot = document.getElementById('statusDot');
const scanLine = document.getElementById('scanLine');
const camBadge = document.getElementById('camBadge');
const countdownText = document.getElementById('countdownText');
const progressCircle = document.getElementById('progressCircle');
const voiceText = document.getElementById('voice-text');

const waveBars = document.querySelectorAll('.wave-bar');
const objectsGrid = document.getElementById('objectsGrid');
const logEl = document.getElementById('log');

const mainBtn = document.getElementById('mainBtn');
const muteBtn = document.getElementById('muteBtn');
const setupCard = document.getElementById('setupCard');

const CIRCUMFERENCE = 2 * Math.PI * 18;

// ===================== LOG =====================
function log(msg, type = 'info') {
  const span = document.createElement('span');
  span.className = type;
  const ts = new Date().toLocaleTimeString();
  span.textContent = `[${ts}] ${msg}`;
  logEl.prepend(span);
}

// ===================== STATUS =====================
function setStatus(state) {
  statusDot.className = 'status-dot ' + state;
}

// ===================== VOICE =====================
function speak(text) {

  if (muted) return;
  if (!window.speechSynthesis) return;

  synth.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-US";
  utt.rate = 1;
  utt.pitch = 1;

  utt.onstart = () => {
    speaking = true;
    waveBars.forEach(b => b.classList.add('speaking'));
  };

  utt.onend = () => {
    speaking = false;
    waveBars.forEach(b => b.classList.remove('speaking'));
  };

  voiceText.textContent = text;
  synth.speak(utt);

  if (document.getElementById('vibToggle')?.checked && navigator.vibrate) {
    navigator.vibrate(100);
  }
}

function toggleMute() {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  log(muted ? 'Voice muted' : 'Voice unmuted');
}

// ===================== CONNECTION =====================
async function testConnection() {

  const url = document.getElementById('serverUrl').value.trim();
  if (!url) {
    speak('Please enter a URL first.');
    return;
  }

  log('Testing connection…');

  try {

    const res = await fetch(url.replace(/\/$/, '') + '/health');

    if (res.status === 200) {

      setStatus('active');
      speak('Server connected successfully!');
      log('✅ Server healthy (200 OK)');

      setupCard.classList.add('hidden');

    } else {
      throw new Error('Status ' + res.status);
    }

  } catch (e) {

    setStatus('danger');
    speak('Connection failed.');
    log('❌ Connection failed: ' + e.message, 'error');

  }
}

// ===================== CAMERA =====================
async function startCamera() {

  try {

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment'
      }
    });

    video.srcObject = stream;

    camera = true;
    camBadge.textContent = 'LIVE';
    scanLine.classList.add('active');

    return true;

  } catch (e) {

    speak('Camera access denied');
    log('Camera error', 'error');
    return false;

  }
}

function stopCamera() {

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  video.srcObject = null;
  camera = false;

  camBadge.textContent = 'CAMERA OFF';
  scanLine.classList.remove('active');
}

// ===================== DETECTION =====================
function updateCountdown() {

  countdownText.textContent = countdown > 0 ? countdown : '📷';

  const offset =
    CIRCUMFERENCE - (countdown / intervalSec) * CIRCUMFERENCE;

  progressCircle.style.strokeDashoffset = offset;
}

function startCountdown() {

  clearInterval(countdownTimer);

  countdown = intervalSec;
  updateCountdown();

  countdownTimer = setInterval(() => {

    countdown--;
    updateCountdown();

    if (countdown <= 0)
      clearInterval(countdownTimer);

  }, 1000);
}

// ===================== SCAN =====================
async function doScan() {

  const url = document.getElementById('serverUrl').value.trim();

  if (!url || !camera) return;

  log('Scanning…');
  setStatus('warning');

  try {

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {

      const form = new FormData();
      form.append('image', blob, 'frame.jpg');

      const res = await fetch(
        url.replace(/\/$/, '') + '/describe',
        {
          method: 'POST',
          body: form
        }
      );

      const data = await res.json();

      setStatus('active');

      speak(data.raw_caption || 'Nothing detected');

      renderObjects(data.objects_detected || []);

    }, 'image/jpeg', 0.85);

  } catch (e) {

    log('Scan error', 'error');
    setStatus('danger');

  }

  if (running) startCountdown();
}

// ===================== OBJECT RENDER =====================
function renderObjects(objects) {

  objectsGrid.innerHTML = '';

  objects.forEach(obj => {

    const chip = document.createElement('div');
    chip.className = 'obj-chip';

    chip.innerHTML = `
      <div class="obj-name">${obj.object}</div>
      <div class="obj-meta">${Math.round(obj.confidence * 100)}%</div>
      <div class="obj-pos pos-${obj.position}">${obj.position}</div>
    `;

    objectsGrid.appendChild(chip);

  });
}

// ===================== START / STOP =====================
async function toggleDetection() {

  if (!running) {

    const ok = await startCamera();
    if (!ok) return;

    running = true;

    mainBtn.textContent = '⏸';
    mainBtn.classList.add('running');

    doScan();

    scanTimer = setInterval(
      doScan,
      intervalSec * 1000
    );

    startCountdown();

  } else {

    running = false;

    clearInterval(scanTimer);
    clearInterval(countdownTimer);

    stopCamera();

    mainBtn.textContent = '▶';
    mainBtn.classList.remove('running');

    setStatus('');

  }
}

// ===================== SNAP =====================
function snapNow() {

  if (!running) return;

  clearInterval(scanTimer);

  doScan();

  scanTimer = setInterval(
    doScan,
    intervalSec * 1000
  );
}

// ===================== INTERVAL =====================
function updateInterval(val) {

  intervalSec = parseInt(val);

  document.getElementById('intervalVal').textContent =
    val + 's';

  if (running) {

    clearInterval(scanTimer);

    scanTimer = setInterval(
      doScan,
      intervalSec * 1000
    );

    startCountdown();

  }
}

// ===================== READY =====================
log('App ready');