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
let voices = [];

// ===================== LOAD VOICES (iOS FIX) =====================
function loadVoices() {
  voices = synth.getVoices();
}

loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

// ===================== SPEECH UNLOCK (REQUIRED FOR IOS) =====================
function unlockSpeech() {
  const msg = new SpeechSynthesisUtterance("");
  msg.volume = 0;
  speechSynthesis.speak(msg);
}

document.addEventListener("click", unlockSpeech, { once: true });
document.addEventListener("touchstart", unlockSpeech, { once: true });

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

  if (!window.speechSynthesis) {
    console.log("Speech not supported");
    return;
  }

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  const utter = new SpeechSynthesisUtterance(text);

  utter.lang = "en-US";
  utter.rate = 1;
  utter.pitch = 1;
  utter.volume = 1;

  // Select first English voice (important for iOS)
  const voice = voices.find(v => v.lang.includes("en"));
  if (voice) utter.voice = voice;

  utter.onstart = () => {
    speaking = true;
    waveBars.forEach(b => b.classList.add('speaking'));
  };

  utter.onend = () => {
    speaking = false;
    waveBars.forEach(b => b.classList.remove('speaking'));
  };

  voiceText.textContent = text;

  speechSynthesis.speak(utter);

  if (document.getElementById('vibToggle')?.checked && navigator.vibrate) {
    navigator.vibrate(100);
  }
}

// ===================== MUTE =====================
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
      speak('Server connected successfully');
      log('Server healthy');

      setupCard.classList.add('hidden');

    } else {
      throw new Error('Status ' + res.status);
    }

  } catch (e) {

    setStatus('danger');
    speak('Connection failed');
    log('Connection failed: ' + e.message, 'error');

  }
}

// ===================== CAMERA =====================
async function startCamera() {

  try {

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = stream;

    camera = true;

    camBadge.textContent = "LIVE";
    scanLine.classList.add("active");

    return true;

  } catch (e) {

    speak("Camera access denied");
    log("Camera error", "error");

    return false;
  }
}

function stopCamera() {

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  video.srcObject = null;

  camera = false;

  camBadge.textContent = "CAMERA OFF";
  scanLine.classList.remove("active");
}

// ===================== COUNTDOWN =====================
function updateCountdown() {

  countdownText.textContent = countdown > 0 ? countdown : "📷";

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

  const url = document.getElementById("serverUrl").value.trim();

  if (!url || !camera) return;

  log("Scanning...");
  setStatus("warning");

  try {

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {

      const form = new FormData();
      form.append("image", blob, "frame.jpg");

      const res = await fetch(
        url.replace(/\/$/, "") + "/describe",
        {
          method: "POST",
          body: form
        }
      );

      const data = await res.json();

      setStatus("active");

      speak(data.raw_caption || "Nothing detected");

      renderObjects(data.objects_detected || []);

    }, "image/jpeg", 0.85);

  } catch (e) {

    log("Scan error", "error");
    setStatus("danger");

  }

  if (running) startCountdown();
}

// ===================== OBJECTS =====================
function renderObjects(objects) {

  objectsGrid.innerHTML = "";

  objects.forEach(obj => {

    const chip = document.createElement("div");
    chip.className = "obj-chip";

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

    mainBtn.textContent = "⏸";
    mainBtn.classList.add("running");

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

    mainBtn.textContent = "▶";
    mainBtn.classList.remove("running");

    setStatus("");

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

  document.getElementById("intervalVal").textContent =
    val + "s";

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
log("App ready");