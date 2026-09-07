const guestName = sessionStorage.getItem("guest_name");
const guestId = sessionStorage.getItem("guest_id");

if (!guestName || !guestId) location.replace("index.html");

const hello = document.getElementById("hello");
const preview = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const photoBtn = document.getElementById("photoBtn");
const videoBtn = document.getElementById("videoBtn");
const flipBtn = document.getElementById("flipBtn");
const finishBtn = document.getElementById("finishBtn");
const gallery = document.getElementById("gallery");
const photoCount = document.getElementById("photoCount");
const videoStatus = document.getElementById("videoStatus");
const statusEl = document.getElementById("status");
const recordBadge = document.getElementById("recordBadge");
const timerEl = document.getElementById("timer");

hello.textContent = `Welcome ${guestName} 🤍`;

let stream = null;
let facingMode = "environment";
let photos = [];
let videoBlob = null;
let mediaRecorder = null;
let recordingTimer = null;
let recordingStarted = false;

function setStatus(msg, error = false) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (error ? " error" : "");
}

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    });
    preview.srcObject = stream;
    await preview.play();
    setStatus("");
  } catch (err) {
    setStatus("Please allow camera and microphone access and make sure the site is opened over HTTPS.", true);
  }
}

function renderGallery() {
  gallery.innerHTML = "";
  photos.forEach((blob, i) => {
    const url = URL.createObjectURL(blob);
    const item = document.createElement("div");
    item.className = "thumb";
    item.innerHTML = `<img src="${url}" alt="صورة ${i + 1}"><button type="button" data-index="${i}">×</button>`;
    item.querySelector("button").onclick = () => {
      photos.splice(i, 1);
      renderGallery();
      photoCount.textContent = photos.length;
    };
    gallery.appendChild(item);
  });
}

async function takePhoto() {
  if (photos.length >= 10 || recordingStarted) return;
  if (!preview.videoWidth) return;
  const maxW = 1600;
  const scale = Math.min(1, maxW / preview.videoWidth);
  canvas.width = Math.round(preview.videoWidth * scale);
  canvas.height = Math.round(preview.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) return;
  photos.push(blob);
  photoCount.textContent = photos.length;
  renderGallery();
}

function chooseMime() {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || "";
}

function startVideo() {
  if (videoBlob || recordingStarted) return;
  if (!stream || !window.MediaRecorder) {
    setStatus("This browser does not support video recording.", true);
    return;
  }

  const mimeType = chooseMime();
  try {
    mediaRecorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000
    });
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }

  const chunks = [];
  recordingStarted = true;
  recordBadge.classList.remove("hidden");
  videoBtn.disabled = true;
  photoBtn.disabled = true;

  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    clearInterval(recordingTimer);
    const type = mediaRecorder.mimeType || "video/webm";
    videoBlob = new Blob(chunks, { type });
    recordingStarted = false;
    recordBadge.classList.add("hidden");
    videoStatus.textContent = "Recorded ✓";
    videoBtn.textContent = "🎥 Video recorded";
    setStatus("Video is ready. Press Finish to upload it.");
  };

  let remaining = 20;
  timerEl.textContent = remaining;
  mediaRecorder.start(250);
  recordingTimer = setInterval(() => {
    remaining--;
    timerEl.textContent = remaining;
    if (remaining <= 0) stopVideo();
  }, 1000);
}

function stopVideo() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

function safeExt(type, fallback) {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  if (type.includes("png")) return "png";
  return fallback;
}

async function uploadBlob(blob, type) {
  if (blob.size > 49 * 1024 * 1024) {
    throw new Error("One of the files is larger than 49 MB.");
  }
  const ext = safeExt(blob.type, type === "image" ? "jpg" : "webm");
  const path = `guests/${guestId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: blob.type || (type === "image" ? "image/jpeg" : "video/webm"),
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabaseClient
    .from(TABLE)
    .insert({
      guest_name: guestName,
      file_path: path,
      file_type: type
    });

  if (dbError) throw dbError;
}

async function finish() {
  if (recordingStarted) {
    setStatus("Please wait for the video recording to finish first.", true);
    return;
  }
  if (photos.length === 0 && !videoBlob) {
    setStatus("Take at least one photo or record a video.", true);
    return;
  }

  finishBtn.disabled = true;
  photoBtn.disabled = true;
  videoBtn.disabled = true;
  flipBtn.disabled = true;

  try {
    const total = photos.length + (videoBlob ? 1 : 0);
    let done = 0;

    for (const photo of photos) {
      done++;
      setStatus(`Uploading... ${done}/${total}`);
      await uploadBlob(photo, "image");
    }

    if (videoBlob) {
      done++;
      setStatus(`Uploading... ${done}/${total}`);
      await uploadBlob(videoBlob, "video");
    }

    if (stream) stream.getTracks().forEach(t => t.stop());
    sessionStorage.removeItem("guest_name");
    sessionStorage.removeItem("guest_id");
    location.replace("thank-you.html");
  } catch (err) {
    console.error(err);
    setStatus("Upload failed. Please try again and check your internet connection.", true);
    finishBtn.disabled = false;
    photoBtn.disabled = false;
    videoBtn.disabled = !!videoBlob;
    flipBtn.disabled = false;
  }
}

photoBtn.onclick = takePhoto;
videoBtn.onclick = () => {
  if (recordingStarted) stopVideo();
  else startVideo();
};
flipBtn.onclick = async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  await startCamera();
};
finishBtn.onclick = finish;

startCamera();
