
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const el = {
    preview: $("cameraPreview"),
    loading: $("loading"),
    loadingText: $("loadingText"),
    message: $("cameraMessage"),
    grid: $("gridOverlay"),
    zoomSlider: $("zoomSlider"),
    zoomBadge: $("zoomBadge"),
    zoomRangeLabel: $("zoomRangeLabel"),
    shutter: $("shutterBtn"),
    shutterInner: $("shutterInner"),
    galleryThumb: $("galleryThumb"),
    galleryPlaceholder: $("galleryPlaceholder"),
    status: $("statusMessage"),
    filterPanel: $("filterPanel"),
    filterList: $("filterList"),
    timerPanel: $("timerPanel"),
    timerStatus: $("timerStatus"),
    exposurePanel: $("exposurePanel"),
    exposureSlider: $("exposureSlider"),
    exposureValue: $("exposureValue"),
    settingsPanel: $("settingsPanel"),
    cameraSelect: $("cameraSelect"),
    resolutionSelect: $("resolutionSelect"),
    aspectSelect: $("aspectSelect"),
    qualitySelect: $("qualitySelect"),
    gridSetting: $("gridSetting"),
    captureSound: $("captureSound"),
    captureCanvas: $("captureCanvas"),
    processingCanvas: $("processingCanvas"),
    reviewPanel: $("reviewPanel"),
    reviewImage: $("reviewImage"),
    reviewStatus: $("reviewStatus"),
    qrPanel: $("qrPanel"),
    qrStatus: $("qrStatus"),
    qrResult: $("qrResult"),
    copyQRBtn: $("copyQRBtn"),
    openQRBtn: $("openQRBtn"),
    scanOverlay: $("scanOverlay"),
    recordingIndicator: $("recordingIndicator"),
    recordingTime: $("recordingTime"),
    videoPanel: $("videoPanel"),
    recordedVideo: $("recordedVideo"),
    videoStatus: $("videoStatus"),
    flashBtn: $("flashBtn"),
    stopCameraBtn: $("stopCameraBtn"),
    startCameraBtn: $("startCameraBtn"),
    savePhotoBtn: $("savePhotoBtn"),
    sharePhotoBtn: $("sharePhotoBtn"),
    saveVideoBtn: $("saveVideoBtn"),
    shareVideoBtn: $("shareVideoBtn")
  };

  const required = [
    "preview", "shutter", "captureCanvas", "processingCanvas",
    "reviewPanel", "reviewImage", "filterList", "status"
  ];

  if (required.some((key) => !el[key])) {
    console.error("NEXORA CAMERA X: required HTML element missing.");
    return;
  }

  const FILTERS = {
    "Natural": "",
    "Warm": "sepia(0.15) saturate(1.12) brightness(1.03)",
    "Cool": "saturate(0.92) hue-rotate(12deg) brightness(1.02)",
    "Vivid": "saturate(1.55) contrast(1.12)",
    "Soft": "brightness(1.05) saturate(0.9) contrast(0.91)",
    "Portrait Tone": "saturate(1.08) contrast(1.03) sepia(0.06)",
    "Vintage": "sepia(0.48) contrast(0.92) saturate(0.82)",
    "Cinema": "contrast(1.2) saturate(0.82) brightness(0.95)",
    "Monochrome": "grayscale(1)",
    "Fade": "contrast(0.82) brightness(1.08) saturate(0.72)"
  };

  const state = {
    stream: null,
    starting: false,
    switching: false,
    facingMode: "environment",
    deviceId: "",
    mode: "photo",
    filter: "Natural",
    timer: 0,
    captureBusy: false,
    recording: false,
    recorder: null,
    videoChunks: [],
    videoBlob: null,
    videoUrl: "",
    imageBlob: null,
    imageUrl: "",
    imageFile: null,
    lastThumbUrl: "",
    recordingStarted: 0,
    recordingTimer: null,
    scanTimer: null,
    scanBusy: false,
    lastQR: "",
    flashOn: false,
    zoomMin: 1,
    zoomMax: 1,
    nativeZoom: false,
    digitalZoom: 1,
    nativeZoomTimer: null,
    toastTimer: null,
    captureGeneration: 0,
    disposed: false
  };

  const track = () => state.stream?.getVideoTracks()[0] || null;
  const capabilities = () => {
    const t = track();
    try {
      return t && typeof t.getCapabilities === "function"
        ? t.getCapabilities()
        : {};
    } catch {
      return {};
    }
  };

  function toast(message, duration = 2600) {
    el.status.textContent = message;
    el.status.classList.add("visible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.status.classList.remove("visible");
    }, duration);
  }

  function setLoading(show, text = "Camera shuru ho raha hai...") {
    el.loading.hidden = !show;
    el.loadingText.textContent = text;
  }

  function setCameraMessage(text) {
    el.message.textContent = text;
    el.message.hidden = !text;
  }

  function openPanel(id) {
    document.querySelectorAll(".panel, .review-panel").forEach((panel) => {
      if (panel.id !== id) panel.hidden = true;
    });
    const panel = $(id);
    if (panel) panel.hidden = false;
  }

  function closePanel(id) {
    if ($(id)) $(id).hidden = true;
  }

  function closeAllPanels() {
    document.querySelectorAll(".panel, .review-panel").forEach((p) => {
      p.hidden = true;
    });
  }

  function safeFileName(extension) {
    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      "-",
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
      String(date.getSeconds()).padStart(2, "0")
    ].join("");

    return `NEXORA_CAMERA_X_${stamp}.${extension}`;
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      try { t.stop(); } catch (error) {
        console.warn("Track cleanup:", error);
      }
    });
  }

  function stopCurrentStream() {
    const old = state.stream;
    state.stream = null;

    if (el.preview.srcObject === old) {
      el.preview.pause();
      el.preview.srcObject = null;
    }

    stopStream(old);
  }

  function supportsCamera() {
    return !!(navigator.mediaDevices &&
              navigator.mediaDevices.getUserMedia);
  }

  function constraintsForCurrentSelection() {
    const video = {
      facingMode: state.deviceId
        ? undefined
        : { ideal: state.facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    };

    if (state.deviceId) {
      delete video.facingMode;
      video.deviceId = { exact: state.deviceId };
    }

    const resolution = el.resolutionSelect?.value || "default";

    if (resolution !== "default") {
      const [width, height] = resolution.split("x").map(Number);
      video.width = { ideal: width };
      video.height = { ideal: height };
    }

    return {
      audio: false,
      video
    };
  }

  function friendlyCameraError(error) {
    const name = error?.name || "";

    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera permission nahi mili. Chrome site settings mein camera allow karein.";
    }

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "Is device par compatible camera nahi mila.";
    }

    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Camera kisi doosre app mein busy ho sakta hai. Doosre app ko band karke dobara try karein.";
    }

    if (name === "OverconstrainedError") {
      return "Selected camera setting supported nahi hai. Default resolution try karein.";
    }

    if (name === "AbortError") {
      return "Camera start nahi ho paya. Dobara try karein.";
    }

    return "Camera start nahi hua. HTTPS, permission aur device availability check karein.";
  }

  async function enumerateCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");
      const current = state.deviceId;

      el.cameraSelect.replaceChildren();

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Default / Facing mode";
      el.cameraSelect.append(defaultOption);

      cameras.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index + 1}`;
        el.cameraSelect.append(option);
      });

      el.cameraSelect.value = current;
    } catch (error) {
      console.warn("Camera enumeration unavailable:", error);
    }
  }

  async function startCamera() {
    if (state.starting || state.switching || state.disposed) return;

    if (!supportsCamera()) {
      setCameraMessage("Is browser mein camera API available nahi hai.");
      toast("Android Chrome ya compatible browser ka use karein.");
      return;
    }

    if (!window.isSecureContext) {
      setCameraMessage("Camera access ke liye HTTPS ya localhost zaroori hai.");
      toast("Site ko secure HTTPS connection par kholein.", 4000);
      return;
    }

    state.starting = true;
    setLoading(true);
    setCameraMessage("");

    const generation = ++state.captureGeneration;

    try {
      // Close the previous stream before starting another.
      stopCurrentStream();

      let newStream;

      try {
        newStream = await navigator.mediaDevices.getUserMedia(
          constraintsForCurrentSelection()
        );
      } catch (firstError) {
        // Some devices reject requested constraints; retry with simpler ones.
        if (firstError?.name === "NotAllowedError") throw firstError;

        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: state.deviceId
            ? { deviceId: { exact: state.deviceId } }
            : { facingMode: state.facingMode }
        });
      }

      if (state.disposed || generation !== state.captureGeneration) {
        stopStream(newStream);
        return;
      }

      state.stream = newStream;
      el.preview.srcObject = newStream;

      await new Promise((resolve, reject) => {
        if (el.preview.readyState >= 1 && el.preview.videoWidth) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Camera preview timed out."));
        }, 10000);

        const loaded = () => {
          if (el.preview.videoWidth > 0) {
            cleanup();
            resolve();
          }
        };

        function cleanup() {
          clearTimeout(timeout);
          el.preview.removeEventListener("loadedmetadata", loaded);
          el.preview.removeEventListener("error", failed);
        }

        function failed() {
          cleanup();
          reject(new Error("Camera preview failed."));
        }

        el.preview.addEventListener("loadedmetadata", loaded);
        el.preview.addEventListener("error", failed);
      });

      await el.preview.play();
      state.deviceId = track()?.getSettings()?.deviceId || state.deviceId;

      await enumerateCameras();
      updateCapabilities();
      applyLiveFilter();
      setCameraMessage("");
      toast("Camera ready");
    } catch (error) {
      console.error("Camera startup failed:", error);
      stopCurrentStream();
      setCameraMessage(friendlyCameraError(error));
      toast(friendlyCameraError(error), 4000);
    } finally {
      state.starting = false;
      setLoading(false);
      updateControls();
    }
  }

  function updateCapabilities() {
    const caps = capabilities();
    const settings = track()?.getSettings() || {};

    state.nativeZoom = Number.isFinite(caps.zoom?.min) &&
                       Number.isFinite(caps.zoom?.max);

    if (state.nativeZoom) {
      state.zoomMin = Math.max(1, caps.zoom.min);
      state.zoomMax = Math.max(state.zoomMin, caps.zoom.max);
    } else {
      state.zoomMin = 1;
      state.zoomMax = 5;
    }

    const initialZoom = state.nativeZoom
      ? (settings.zoom || state.zoomMin)
      : state.digitalZoom;

    el.zoomSlider.min = String(state.zoomMin);
    el.zoomSlider.max = String(state.zoomMax);
    el.zoomSlider.step = state.nativeZoom ? "0.1" : "0.1";
    el.zoomSlider.value = String(initialZoom);
    updateZoomLabels(initialZoom);

    const hasExposure = Number.isFinite(caps.exposureCompensation?.min) &&
                        Number.isFinite(caps.exposureCompensation?.max);

    el.exposureSlider.disabled = !hasExposure;

    if (hasExposure) {
      el.exposureSlider.min = String(caps.exposureCompensation.min);
      el.exposureSlider.max = String(caps.exposureCompensation.max);
      el.exposureSlider.step = String(caps.exposureCompensation.step || 0.5);
      el.exposureSlider.value = String(
        settings.exposureCompensation ?? 0
      );
    }

    el.flashBtn.disabled = !caps.torch;
    el.flashBtn.title = caps.torch
      ? "Toggle camera torch"
      : "Torch unsupported by this camera";

    el.flashBtn.style.opacity = caps.torch ? "1" : ".45";

    // Unsupported settings remain visible but are honestly disabled.
    el.resolutionSelect.title =
      `Actual stream: ${settings.width || "?"} × ${settings.height || "?"}`;
  }

  function updateZoomLabels(value) {
    const z = Number(value);
    const label = `${z.toFixed(z % 1 ? 1 : 0)}×`;
    el.zoomBadge.textContent = label;
    el.zoomRangeLabel.textContent = label;

    document.querySelectorAll(".zoom-preset").forEach((button) => {
      button.classList.toggle(
        "active",
        Math.abs(Number(button.dataset.zoom) - z) < 0.08
      );
    });
  }

  async function applyNativeZoom(value) {
    const t = track();
    if (!t || !state.nativeZoom) return;

    const caps = capabilities();
    const zoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, value));

    try {
      await t.applyConstraints({ advanced: [{ zoom }] });
    } catch (error) {
      console.warn("Native zoom rejected:", error);
      toast("Native zoom setting apply nahi ho saki.");
    }
  }

  function applyDigitalZoom(value) {
    state.digitalZoom = value;

    // Software magnification only. This is not optical zoom.
    const z = Math.max(1, Math.min(5, value));
    el.preview.style.transformOrigin = "center center";

    const mirrored = state.facingMode === "user" && !state.deviceId;
    el.preview.style.transform =
      `${mirrored ? "scaleX(-1) " : ""}scale(${z})`;
  }

  function setZoom(value) {
    const min = Number(el.zoomSlider.min);
    const max = Number(el.zoomSlider.max);
    const z = Math.max(min, Math.min(max, Number(value)));

    el.zoomSlider.value = String(z);
    updateZoomLabels(z);

    if (state.nativeZoom) {
      clearTimeout(state.nativeZoomTimer);
      state.nativeZoomTimer = setTimeout(() => {
        applyNativeZoom(z);
      }, 80);
    } else {
      applyDigitalZoom(z);
    }
  }

  async function switchCamera() {
    if (state.starting || state.switching) return;
    if (state.recording) {
      toast("Video recording ke dauran camera switch nahi kar sakte.");
      return;
    }

    state.switching = true;

    try {
      state.deviceId = "";
      state.facingMode =
        state.facingMode === "environment" ? "user" : "environment";

      await startCamera();
    } finally {
      state.switching = false;
    }
  }

  function buildFilterTray() {
    el.filterList.replaceChildren();

    Object.entries(FILTERS).forEach(([name, css]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-option";
      button.dataset.filter = name;

      const preview = document.createElement("span");
      preview.className = "filter-preview";
      preview.style.filter = css || "none";

      const label = document.createElement("span");
      label.textContent = name;

      button.append(preview, label);
      button.addEventListener("click", () => setFilter(name));
      el.filterList.append(button);
    });

    updateFilterSelection();
  }

  function updateFilterSelection() {
    el.filterList.querySelectorAll(".filter-option").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === state.filter);
    });
  }

  function applyLiveFilter() {
    const filter = FILTERS[state.filter] || "";
    el.preview.style.filter = filter;
  }

  function setFilter(name) {
    if (!(name in FILTERS)) return;

    state.filter = name;
    applyLiveFilter();
    updateFilterSelection();

    toast(`${name} filter selected`);
  }

  function canvasFilter(ctx) {
    ctx.filter = FILTERS[state.filter] || "none";
  }

  function dimensionsForPhoto(width, height) {
    const ratio = el.aspectSelect?.value || "source";

    if (ratio === "source") return [width, height];

    const [rw, rh] = ratio.split(":").map(Number);
    const target = rw / rh;
    const current = width / height;

    if (current > target) {
      return [Math.round(height * target), height];
    }

    return [width, Math.round(width / target)];
  }

  function drawCurrentFrame(canvas) {
    const video = el.preview;

    if (!state.stream || !video.videoWidth || !video.videoHeight) {
      throw new Error("Camera preview ready nahi hai.");
    }

    const [width, height] = dimensionsForPhoto(
      video.videoWidth,
      video.videoHeight
    );

    if (!width || !height) {
      throw new Error("Invalid camera frame dimensions.");
    }

    // Bound memory consumption for processed output.
    const maxPixels = 16_000_000;
    const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) throw new Error("Canvas 2D context unavailable.");

    ctx.save();
    ctx.filter = FILTERS[state.filter] || "none";

    // Mirror front camera photos to match the mirrored preview.
    if (state.facingMode === "user" && !state.deviceId) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    const sourceRatio = video.videoWidth / video.videoHeight;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;

    if (sourceRatio > targetRatio) {
      sw = video.videoHeight * targetRatio;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / targetRatio;
      sy = (video.videoHeight - sh) / 2;
    }

    ctx.drawImage(
      video,
      sx, sy, sw, sh,
      0, 0, canvas.width, canvas.height
    );

    ctx.restore();
    ctx.filter = "none";
  }

  function canvasToBlob(canvas, type = "image/jpeg", quality = 0.9) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob || !blob.size) {
            reject(new Error("Image file create nahi ho saki."));
            return;
          }

          if (!blob.type.startsWith("image/")) {
            reject(new Error("Invalid image format."));
            return;
          }

          resolve(blob);
        }, type, quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  function releaseImageResources() {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = "";
    }

    state.imageBlob = null;
    state.imageFile = null;
  }

  async function capturePhoto() {
    if (state.captureBusy || state.starting) return;

    if (!state.stream || !el.preview.videoWidth) {
      toast("Pehle camera start karein.");
      return;
    }

    if (state.mode === "video") {
      if (state.recording) stopVideoRecording();
      else startVideoRecording();
      return;
    }

    if (state.mode === "qr") {
      toast("QR scanner ko alag se kholein.");
      return;
    }

    state.captureBusy = true;
    el.shutter.disabled = true;

    try {
      if (state.timer > 0) {
        for (let remaining = state.timer; remaining > 0; remaining--) {
          el.timerStatus.textContent = `Photo ${remaining} sec mein...`;
          toast(String(remaining), 850);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!state.stream || !el.preview.videoWidth) {
        throw new Error("Capture se pehle camera band ho gaya.");
      }

      drawCurrentFrame(el.captureCanvas);

      const quality = Number(el.qualitySelect.value || 0.85);
      const blob = await canvasToBlob(
        el.captureCanvas,
        "image/jpeg",
        Math.min(1, Math.max(0.5, quality))
      );

      releaseImageResources();

      state.imageBlob = blob;
      state.imageUrl = URL.createObjectURL(blob);
      state.imageFile = new File(
        [blob],
        safeFileName("jpg"),
        { type: "image/jpeg", lastModified: Date.now() }
      );

      el.reviewImage.src = state.imageUrl;
      el.reviewStatus.textContent =
        `Image ready · ${el.captureCanvas.width} × ${el.captureCanvas.height}`;

      el.galleryThumb.src = state.imageUrl;
      el.galleryThumb.hidden = false;
      el.galleryPlaceholder.hidden = true;

      openPanel("reviewPanel");

      if (el.captureSound.checked) captureFeedback();

      toast("Photo capture ho gayi. Save karne ke liye Save Photo dabayein.");
    } catch (error) {
      console.error("Photo capture failed:", error);
      toast(error.message || "Photo capture fail ho gayi.", 4000);
    } finally {
      state.captureBusy = false;
      el.shutter.disabled = false;
    }
  }

  function captureFeedback() {
    // Subtle vibration only where the browser supports it.
    try {
      if (navigator.vibrate) navigator.vibrate(25);
    } catch {
      // Optional feedback only.
    }
  }

  async function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("Save karne ke liye valid file available nahi hai.");
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";

    document.body.append(anchor);

    try {
      anchor.click();
      toast("Download request bhej di gayi. Downloads folder check karein.");
    } finally {
      anchor.remove();

      // Give the browser time to begin consuming the URL.
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  async function savePhoto() {
    if (!state.imageBlob || !state.imageFile) {
      toast("Save karne ke liye pehle photo capture karein.");
      return;
    }

    el.savePhotoBtn.disabled = true;

    try {
      await downloadBlob(state.imageBlob, state.imageFile.name);
      el.reviewStatus.textContent =
        "Download initiate hua. Android par Files > Downloads check karein.";
    } catch (error) {
      console.error("Photo save failed:", error);
      el.reviewStatus.textContent = error.message || "Photo save nahi hui.";
      toast("Photo download nahi ho saki.", 4000);
    } finally {
      el.savePhotoBtn.disabled = false;
    }
  }

  async function sharePhoto() {
    if (!state.imageFile) {
      toast("Share karne ke liye pehle photo capture karein.");
      return;
    }

    try {
      if (navigator.canShare &&
          navigator.canShare({ files: [state.imageFile] }) &&
          navigator.share) {
        await navigator.share({
          title: "NEXORA CAMERA X",
          files: [state.imageFile]
        });
      } else {
        await downloadBlob(state.imageBlob, state.imageFile.name);
        toast("Direct sharing supported nahi hai. Photo download kar di gayi.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Photo sharing failed:", error);
        toast("Sharing fail hui. Save Photo try karein.");
      }
    }
  }

  function retakePhoto() {
    closePanel("reviewPanel");
    releaseImageResources();
    toast("Camera dobara photo lene ke liye taiyar hai.");
  }

  async function startVideoRecording() {
    if (!state.stream || state.recording) return;

    if (typeof MediaRecorder === "undefined") {
      toast("Is browser mein MediaRecorder available nahi hai.", 4000);
      return;
    }

    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4"
    ];

    let mimeType = "";

    if (typeof MediaRecorder.isTypeSupported === "function") {
      mimeType = candidates.find((type) =>
        MediaRecorder.isTypeSupported(type)
      ) || "";
    }

    try {
      state.videoChunks = [];

      state.recorder = new MediaRecorder(
        state.stream,
        mimeType ? { mimeType } : undefined
      );

      state.recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          state.videoChunks.push(event.data);
        }
      });

      state.recorder.addEventListener("error", (event) => {
        console.error("Recorder error:", event.error);
        toast("Video recording mein error aa gaya.", 4000);
      });

      state.recorder.addEventListener("stop", finishVideoRecording, {
        once: true
      });

      state.recorder.start(1000);
      state.recording = true;
      state.recordingStarted = Date.now();

      el.shutter.classList.add("recording");
      el.recordingIndicator.hidden = false;
      el.shutter.setAttribute("aria-label", "Stop video recording");

      state.recordingTimer = setInterval(() => {
        const seconds = Math.floor(
          (Date.now() - state.recordingStarted) / 1000
        );
        const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
        const secs = String(seconds % 60).padStart(2, "0");
        el.recordingTime.textContent = `${mins}:${secs}`;
      }, 250);

      toast("Video recording shuru ho gayi.");
    } catch (error) {
      console.error("Video recorder failed:", error);
      state.recording = false;
      toast("Video recorder start nahi ho paya.", 4000);
    }
  }

  function stopVideoRecording() {
    if (!state.recording || !state.recorder) return;

    try {
      if (state.recorder.state !== "inactive") {
        state.recorder.stop();
      }
    } catch (error) {
      console.error("Could not stop recorder:", error);
      toast("Recording stop nahi ho saki.", 4000);
    }

    state.recording = false;
    clearInterval(state.recordingTimer);
    state.recordingTimer = null;
    el.shutter.classList.remove("recording");
    el.recordingIndicator.hidden = true;
    el.shutter.setAttribute("aria-label", "Start video recording");
  }

  function finishVideoRecording() {
    const recorderType = state.recorder?.mimeType || "video/webm";
    const blob = new Blob(state.videoChunks, { type: recorderType });

    if (!blob.size) {
      toast("Video file khali hai. Dobara record karein.");
      return;
    }

    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);

    state.videoBlob = blob;
    state.videoUrl = URL.createObjectURL(blob);
    el.recordedVideo.src = state.videoUrl;
    el.videoStatus.textContent =
      `Recording ready · ${(blob.size / (1024 * 1024)).toFixed(1)} MB`;

    openPanel("videoPanel");
    toast("Video ready hai. Playback check karke save karein.");
  }

  async function saveVideo() {
    if (!state.videoBlob) {
      toast("Save karne ke liye video record karein.");
      return;
    }

    const ext = state.videoBlob.type.includes("mp4") ? "mp4" : "webm";
    el.saveVideoBtn.disabled = true;

    try {
      await downloadBlob(state.videoBlob, safeFileName(ext));
      el.videoStatus.textContent =
        "Download initiate hua. Files > Downloads mein video check karein.";
    } catch (error) {
      console.error("Video save failed:", error);
      toast("Video save nahi ho saki.");
    } finally {
      el.saveVideoBtn.disabled = false;
    }
  }

  async function shareVideo() {
    if (!state.videoBlob) {
      toast("Share karne ke liye video record karein.");
      return;
    }

    const ext = state.videoBlob.type.includes("mp4") ? "mp4" : "webm";
    const file = new File(
      [state.videoBlob],
      safeFileName(ext),
      { type: state.videoBlob.type }
    );

    try {
      if (navigator.canShare &&
          navigator.canShare({ files: [file] }) &&
          navigator.share) {
        await navigator.share({ title: "NEXORA CAMERA X Video", files: [file] });
      } else {
        await downloadBlob(state.videoBlob, file.name);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        toast("Video sharing fail hui.");
      }
    }
  }

  async function toggleTorch() {
    const t = track();
    const caps = capabilities();

    if (!t || !caps.torch) {
      toast("Is camera par torch control supported nahi hai.");
      return;
    }

    try {
      state.flashOn = !state.flashOn;
      await t.applyConstraints({
        advanced: [{ torch: state.flashOn }]
      });

      el.flashBtn.style.background =
        state.flashOn ? "#555b66" : "";
      toast(state.flashOn ? "Torch on" : "Torch off");
    } catch (error) {
      state.flashOn = false;
      console.warn("Torch failed:", error);
      toast("Torch setting apply nahi ho saki.");
    }
  }

  async function applyExposure(value) {
    const t = track();
    const caps = capabilities();

    if (!t || !caps.exposureCompensation) {
      toast("Hardware exposure compensation supported nahi hai.");
      return;
    }

    try {
      const min = caps.exposureCompensation.min;
      const max = caps.exposureCompensation.max;
      const amount = Math.max(min, Math.min(max, Number(value)));

      await t.applyConstraints({
        advanced: [{ exposureCompensation: amount }]
      });

      el.exposureValue.textContent = String(amount);
    } catch (error) {
      console.warn("Exposure update failed:", error);
      toast("Exposure setting apply nahi ho saki.");
    }
  }

  function updateControls() {
    const ready = !!state.stream;
    el.shutter.disabled = !ready || state.captureBusy;
    $("switchCameraBtn").disabled = !ready || state.recording;
    el.zoomSlider.disabled = !ready;
  }

  async function setMode(mode) {
    const supported = [
      "photo", "video", "portrait", "night", "timelapse"
    ];

    if (!supported.includes(mode)) return;

    if (state.recording && mode !== "video") {
      toast("Pehle video recording stop karein.");
      return;
    }

    state.mode = mode;

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.mode === mode);
    });

    if (mode === "portrait") {
      toast("Portrait effect: selected filter apply hoga; hardware depth blur nahi.");
      setFilter("Portrait Tone");
    } else if (mode === "night") {
      toast("Night mode hardware Night Mode pipeline nahi hai. Stable scene mein capture karein.");
      setFilter("Soft");
    } else if (mode === "timelapse") {
      toast("Time-lapse ke liye sampled-frame capture abhi enabled nahi hai.");
    } else if (mode === "video") {
      toast("Video mode: shutter se recording start/stop karein.");
    } else {
      setFilter("Natural");
    }

    el.shutter.setAttribute(
      "aria-label",
      mode === "video" ? "Start or stop video recording" : "Take photo"
    );
  }

  async function openQRScanner() {
    closeAllPanels();
    openPanel("qrPanel");
    el.scanOverlay.hidden = false;
    el.qrResult.value = "";
    el.openQRBtn.disabled = true;
    state.lastQR = "";

    if (!("BarcodeDetector" in window)) {
      el.qrStatus.textContent =
        "Is browser mein BarcodeDetector API available nahi hai. QR decoding yahan supported nahi hai.";
      el.scanOverlay.hidden = true;
      toast("QR scanner ke liye compatible browser/API chahiye.", 4000);
      return;
    }

    let detector;

    try {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch (error) {
      el.qrStatus.textContent = "QR format detector create nahi ho saka.";
      el.scanOverlay.hidden = true;
      return;
    }

    if (!state.stream) {
      await startCamera();
    }

    if (!state.stream) {
      el.qrStatus.textContent = "Camera start nahi hua. Permission check karein.";
      el.scanOverlay.hidden = true;
      return;
    }

    el.qrStatus.textContent = "Scanning... QR code ko frame mein rakhein.";

    const scan = async () => {
      if (el.qrPanel.hidden || !state.stream || state.scanBusy) return;

      state.scanBusy = true;

      try {
        if (el.preview.readyState >= 2 && el.preview.videoWidth) {
          const results = await detector.detect(el.preview);

          if (results.length) {
            const value = results[0].rawValue || "";

            if (value && value !== state.lastQR) {
              state.lastQR = value;
              el.qrResult.value = value;
              el.qrStatus.textContent = "QR code successfully decode ho gaya.";
              el.openQRBtn.disabled = !isSafeReviewableURL(value);
              el.scanOverlay.hidden = true;
              toast("QR code mil gaya.");
              return;
            }
          }
        }
      } catch (error) {
        console.warn("QR detection error:", error);
      } finally {
        state.scanBusy = false;
      }

      if (!el.qrPanel.hidden) {
        state.scanTimer = setTimeout(scan, 180);
      }
    };

    clearTimeout(state.scanTimer);
    scan();
  }

  function isSafeReviewableURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  async function copyQRResult() {
    const value = el.qrResult.value;

    if (!value) {
      toast("Copy karne ke liye QR result nahi hai.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        el.qrResult.focus();
        el.qrResult.select();

        const copied = document.execCommand("copy");
        if (!copied) throw new Error("Clipboard copy unavailable.");
      }

      toast("QR result copy ho gaya.");
    } catch (error) {
      console.warn("Clipboard failed:", error);
      toast("Copy nahi hua. Text ko manually select karein.");
    }
  }

  function reviewQRLink() {
    const value = el.qrResult.value;

    if (!isSafeReviewableURL(value)) {
      toast("Yeh valid HTTP/HTTPS link nahi hai.");
      return;
    }

    // Show the destination and require another explicit user action.
    let destination;

    try {
      destination = new URL(value).href;
    } catch {
      return;
    }

    const confirmed = window.confirm(
      `Kya aap is website ko kholna chahte hain?\n\n${destination}`
    );

    if (confirmed) window.open(destination, "_blank", "noopener,noreferrer");
  }

  function openGallery() {
    if (state.imageUrl) {
      openPanel("reviewPanel");
      return;
    }

    toast("Abhi is session mein koi photo capture nahi hui.");
  }

  function clearVideoResources() {
    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
      state.videoUrl = "";
    }

    state.videoBlob = null;
    state.videoChunks = [];
    el.recordedVideo.pause();
    el.recordedVideo.removeAttribute("src");
    el.recordedVideo.load();
  }

  function stopScanning() {
    clearTimeout(state.scanTimer);
    state.scanTimer = null;
    state.lastQR = "";
    state.scanBusy = false;
    el.scanOverlay.hidden = true;
  }

  // UI event wiring.
  $("settingsBtn").addEventListener("click", () => openPanel("settingsPanel"));

  $("filterBtn").addEventListener("click", () => {
    openPanel("filterPanel");
  });

  $("timerBtn").addEventListener("click", () => openPanel("timerPanel"));

  $("gridBtn").addEventListener("click", () => {
    el.grid.hidden = !el.grid.hidden;
    el.gridSetting.checked = !el.grid.hidden;
    toast(el.grid.hidden ? "Grid off" : "Grid on");
  });

  $("exposureBtn").addEventListener("click", () => {
    openPanel("exposurePanel");
  });

  $("qrBtn").addEventListener("click", openQRScanner);

  $("switchCameraBtn").addEventListener("click", switchCamera);
  $("flashBtn").addEventListener("click", toggleTorch);
  $("galleryBtn").addEventListener("click", openGallery);
  el.shutter.addEventListener("click", capturePhoto);

  el.zoomSlider.addEventListener("input", (event) => {
    setZoom(event.target.value);
  });

  document.querySelectorAll(".zoom-preset").forEach((button) => {
    button.addEventListener("click", () => {
      const requested = Number(button.dataset.zoom);
      const max = Number(el.zoomSlider.max);
      setZoom(Math.min(requested, max));
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  document.querySelectorAll("[data-timer]").forEach((button) => {
    button.addEventListener("click", () => {
      state.timer = Number(button.dataset.timer);

      document.querySelectorAll("[data-timer]").forEach((b) => {
        b.classList.toggle("active", b === button);
      });

      el.timerStatus.textContent = state.timer
        ? `Photo ${state.timer} seconds ke baad capture hogi.`
        : "Timer off hai.";
    });
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closePanel(button.dataset.close);
      if (button.dataset.close === "qrPanel") stopScanning();
    });
  });

  el.exposureSlider.addEventListener("input", (event) => {
    el.exposureValue.textContent = event.target.value;
  });

  el.exposureSlider.addEventListener("change", (event) => {
    applyExposure(event.target.value);
  });

  el.gridSetting.addEventListener("change", () => {
    el.grid.hidden = !el.gridSetting.checked;
  });

  el.startCameraBtn.addEventListener("click", startCamera);

  el.stopCameraBtn.addEventListener("click", () => {
    if (state.recording) {
      toast("Camera band karne se pehle recording stop karein.");
      return;
    }

    stopCurrentStream();
    setCameraMessage("Camera band hai. Start Camera dabayein.");
    updateControls();
    toast("Camera stopped");
  });

  el.cameraSelect.addEventListener("change", async (event) => {
    state.deviceId = event.target.value;
    await startCamera();
  });

  el.resolutionSelect.addEventListener("change", async () => {
    if (!state.stream) return;
    if (state.recording) {
      toast("Recording ke dauran resolution change nahi kar sakte.");
      return;
    }

    await startCamera();
  });

  $("aspectSelect").addEventListener("change", () => {
    toast("Aspect ratio agle captured photo par apply hoga.");
  });

  $("reviewCloseBtn").addEventListener("click", () => {
    closePanel("reviewPanel");
  });

  $("retakeBtn").addEventListener("click", retakePhoto);

  $("reviewFilterBtn").addEventListener("click", () => {
    closePanel("reviewPanel");
    openPanel("filterPanel");
  });

  el.savePhotoBtn.addEventListener("click", savePhoto);
  el.sharePhotoBtn.addEventListener("click", sharePhoto);

  $("qrCloseBtn").addEventListener("click", () => {
    closePanel("qrPanel");
    stopScanning();
  });

  el.copyQRBtn.addEventListener("click", copyQRResult);
  el.openQRBtn.addEventListener("click", reviewQRLink);

  $("videoCloseBtn").addEventListener("click", () => {
    closePanel("videoPanel");
  });

  $("discardVideoBtn").addEventListener("click", () => {
    clearVideoResources();
    closePanel("videoPanel");
    toast("Video discarded");
  });

  el.saveVideoBtn.addEventListener("click", saveVideo);
  el.shareVideoBtn.addEventListener("click", shareVideo);

  // Browser may stop the camera track when the user revokes permission.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && el.qrPanel && !el.qrPanel.hidden) {
      stopScanning();
    }

    if (document.hidden && state.recording) {
      // Keep the recording explicit; do not silently claim recording continues.
      toast("App background mein jaane par recording browser par depend karti hai.", 4000);
    }
  });

  window.addEventListener("pagehide", () => {
    state.disposed = true;
    clearInterval(state.recordingTimer);
    clearTimeout(state.scanTimer);
    clearTimeout(state.nativeZoomTimer);

    if (state.recording && state.recorder &&
        state.recorder.state !== "inactive") {
      try { state.recorder.stop(); } catch {}
    }

    stopCurrentStream();
  });

  buildFilterTray();
  updateControls();
  enumerateCameras();

  if (supportsCamera() && window.isSecureContext) {
    setCameraMessage("Camera start karne ke liye Start dabayein");
  } else if (!window.isSecureContext) {
    setCameraMessage("Camera ke liye secure HTTPS connection zaroori hai.");
  } else {
    setCameraMessage("Is browser mein camera support nahi hai.");
  }

  console.info("NEXORA CAMERA X initialized.");
});
