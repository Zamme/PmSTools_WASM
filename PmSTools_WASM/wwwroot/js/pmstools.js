const pmstoolsCameraProfiles = [
/*   {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 4096 },
      height: { ideal: 2160 },
      frameRate: { ideal: 30, max: 60 }
    },
    audio: false
  }, */
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    },
    audio: false
  },
  {
    video: {
      facingMode: "environment"
    },
    audio: false
  }
];

async function pmstoolsGetBestCameraStream() {
  let lastError = null;

  for (const constraints of pmstoolsCameraProfiles) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to access camera.");
}

async function pmstoolsApplyCameraEnhancements(track, options) {
  if (!track || typeof track.applyConstraints !== "function") {
    return;
  }

  let capabilities = null;
  if (typeof track.getCapabilities === "function") {
    try {
      capabilities = track.getCapabilities();
    } catch (error) {
      capabilities = null;
    }
  }

  const advanced = [];
  const focusPreference = options && typeof options.focusPreference === "string"
    ? options.focusPreference.toLowerCase()
    : "continuous";
  const focusModes = capabilities && Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];

  if (focusPreference === "single-shot" && focusModes.includes("single-shot")) {
    advanced.push({ focusMode: "single-shot" });
  } else if (focusPreference === "continuous" && focusModes.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }

  const constraints = {};
  if (advanced.length > 0) {
    constraints.advanced = advanced;
  }

  if (Object.keys(constraints).length === 0) {
    return;
  }

  try {
    await track.applyConstraints(constraints);
  } catch (error) {
    console.warn("Camera enhancement constraints not fully supported", error);
  }
}

const pmstoolsBurstModeOriginalConstraints = new WeakMap();

async function pmstoolsSetCameraBurstMode(track, enabled) {
  if (!track || typeof track.applyConstraints !== "function") {
    return;
  }

  if (enabled) {
    if (!pmstoolsBurstModeOriginalConstraints.has(track) && typeof track.getConstraints === "function") {
      try {
        pmstoolsBurstModeOriginalConstraints.set(track, track.getConstraints());
      } catch {
        // Ignore constraint snapshot failures on partially supported browsers.
      }
    }

    try {
      await track.applyConstraints({
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 }
      });
      return;
    } catch {
      // Fall back to softer constraints for browsers that reject strict max values.
    }

    try {
      await track.applyConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24 }
      });
    } catch (error) {
      console.warn("Unable to apply burst camera constraints", error);
    }

    return;
  }

  const previousConstraints = pmstoolsBurstModeOriginalConstraints.get(track);
  pmstoolsBurstModeOriginalConstraints.delete(track);

  if (previousConstraints && Object.keys(previousConstraints).length > 0) {
    try {
      await track.applyConstraints(previousConstraints);
      return;
    } catch {
      // Fall through to baseline restore constraints.
    }
  }

  try {
    await track.applyConstraints({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    });
  } catch (error) {
    console.warn("Unable to restore camera constraints after burst mode", error);
  }
}

const pmstoolsLoadTesseractWorker = (async function () {
  const workerPromises = new Map();

  return async function (lang) {
    if (!window.Tesseract || !window.Tesseract.createWorker) {
      return null;
    }

    const language = lang || "eng";
    if (!workerPromises.has(language)) {
      workerPromises.set(language, (async () => {
        const worker = await window.Tesseract.createWorker({
          logger: () => {}
        });
        await worker.loadLanguage(language);
        await worker.initialize(language);
        return worker;
      })());
    }

    return workerPromises.get(language);
  };
})();

const pmstoolsPrewarmBurstOcr = (async function () {
  const warmupPromises = new Map();

  return async function (lang, includeOpenCv) {
    const language = lang || "eng";
    const key = `${language}|${includeOpenCv ? "opencv" : "no-opencv"}`;

    if (!warmupPromises.has(key)) {
      warmupPromises.set(key, (async () => {
        const loaded = await window.pmstools.loadTesseract();
        if (!loaded) {
          return false;
        }

        await pmstoolsLoadTesseractWorker(language);

        if (includeOpenCv) {
          await window.pmstools.loadOpenCv();
        }

        return true;
      })());
    }

    return warmupPromises.get(key);
  };
})();

window.pmstools = {
  loadTesseract: (function () {
    let loadPromise = null;

    function toAbsoluteUrl(path) {
      return new URL(path, document.baseURI || "/").toString();
    }

    function configureTesseractPaths() {
      if (!window.Tesseract) {
        return;
      }

      window.Tesseract.workerPath = toAbsoluteUrl("lib/tesseract/worker.min.js");
      window.Tesseract.corePath = toAbsoluteUrl("lib/tesseract/tesseract-core.wasm.js");
      window.Tesseract.langPath = toAbsoluteUrl("lib/tesseract/lang/");
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(script);
      });
    }

    return async function () {
      if (window.Tesseract && (window.Tesseract.recognize || window.Tesseract.createWorker)) {
        configureTesseractPaths();
        return true;
      }

      if (!loadPromise) {
        const localLegacyUrl = toAbsoluteUrl("lib/tesseract/tesseract.min.js");
        const urls = [localLegacyUrl];

        loadPromise = (async () => {
          for (const url of urls) {
            try {
              await loadScript(url);
            } catch (error) {
              console.warn("Tesseract load failed", error);
              continue;
            }

            configureTesseractPaths();
            if (window.Tesseract && window.Tesseract.recognize) {
              return true;
            }
          }

          return false;
        })();
      }

      const loaded = await loadPromise;
      return !!loaded && !!(window.Tesseract && (window.Tesseract.recognize || window.Tesseract.createWorker));
    };
  })(),
  storageAvailable: function () {
    try {
      const testKey = "pmstools.storage.test";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  },
  storageGetItem: function (key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  storageSetItem: function (key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  },
  storageRemoveItem: function (key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  },
  startCamera: async function (videoId, options) {
    const video = document.getElementById(videoId);
    if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }

    if (video.srcObject) {
      const previousTracks = video.srcObject.getTracks ? video.srcObject.getTracks() : [];
      previousTracks.forEach((track) => track.stop());
      video.srcObject = null;
    }

    const stream = await pmstoolsGetBestCameraStream();
    const [videoTrack] = stream.getVideoTracks();
    await pmstoolsApplyCameraEnhancements(videoTrack, options);

    video.srcObject = stream;
    await video.play();
    return true;
  },
  stopCamera: function (videoId) {
    const video = document.getElementById(videoId);
    if (!video || !video.srcObject) {
      return;
    }

    const stream = video.srcObject;
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    video.srcObject = null;
  },
  isCameraRunning: function (videoId) {
    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.getVideoTracks) {
      return false;
    }

    const tracks = video.srcObject.getVideoTracks();
    return tracks.some((track) => track.readyState === "live" && track.enabled !== false);
  },
  setCameraBurstMode: async function (videoId, enabled) {
    const video = document.getElementById(videoId);
    if (!video || !video.srcObject || !video.srcObject.getVideoTracks) {
      return false;
    }

    const [track] = video.srcObject.getVideoTracks();
    if (!track || track.readyState !== "live") {
      return false;
    }

    await pmstoolsSetCameraBurstMode(track, !!enabled);
    return true;
  },
  captureFrameDataUrl: function (videoId, options) {
    const video = document.getElementById(videoId);
    if (!video) {
      return null;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    let sx = 0;
    let sy = 0;
    let sw = width;
    let sh = height;

    const crop = options && options.crop ? options.crop : null;
    if (crop) {
      const mode = crop.mode === "normalized" ? "normalized" : "pixels";
      if (mode === "normalized") {
        sx = Number(crop.x) * width;
        sy = Number(crop.y) * height;
        sw = Number(crop.width) * width;
        sh = Number(crop.height) * height;
      } else {
        sx = Number(crop.x);
        sy = Number(crop.y);
        sw = Number(crop.width);
        sh = Number(crop.height);
      }

      if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sw) || !Number.isFinite(sh)) {
        sx = 0;
        sy = 0;
        sw = width;
        sh = height;
      }

      sx = Math.min(Math.max(0, sx), Math.max(0, width - 1));
      sy = Math.min(Math.max(0, sy), Math.max(0, height - 1));
      sw = Math.min(Math.max(1, sw), width - sx);
      sh = Math.min(Math.max(1, sh), height - sy);
    }

    const targetWidth = Math.max(1, Math.round(sw));
    const targetHeight = Math.max(1, Math.round(sh));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpg", 0.9);
  },
  loadOpenCv: (function () {
    let loadPromise = null;

    function isReady() {
      return !!(window.cv && typeof window.cv.imread === "function" && typeof window.cv.Mat === "function");
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(script);
      });
    }

    function waitUntilReady(timeoutMs) {
      return new Promise((resolve) => {
        const started = Date.now();

        const check = function () {
          if (isReady()) {
            resolve(true);
            return;
          }

          if (Date.now() - started >= timeoutMs) {
            resolve(false);
            return;
          }

          setTimeout(check, 100);
        };

        check();
      });
    }

    return async function () {
      if (isReady()) {
        return true;
      }

      if (!loadPromise) {
        loadPromise = (async () => {
          const existingScript = Array.from(document.scripts || []).some((script) => {
            const src = script && script.src ? script.src : "";
            return src.includes("opencv.js");
          });

          try {
            if (!existingScript) {
              await loadScript("https://docs.opencv.org/4.x/opencv.js");
            }
          } catch (error) {
            console.warn("OpenCV load failed", error);
          }

          return waitUntilReady(15000);
        })();
      }

      const loaded = await loadPromise;
      return !!loaded && isReady();
    };
  })(),
  preprocessDataUrl: async function (dataUrl, options) {
    const opts = Object.assign({
      preprocess: true,
      useOpenCv: true,
      maxDim: 1600,
      grayscale: true,
      adaptiveThreshold: true,
      adaptiveBlockSize: 31,
      adaptiveC: 7,
      denoiseKernelSize: 3,
      closeKernelSize: 2,
      threshold: 170,
      contrast: 1.15
    }, options || {});

    if (!dataUrl || !opts.preprocess) {
      return dataUrl || "";
    }

    const image = new Image();
    const imageLoaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(true);
      image.onerror = () => reject(new Error("Failed to load image"));
    });
    image.src = dataUrl;
    await imageLoaded;

    const maxDim = Math.max(200, Number(opts.maxDim) || 1600);
    let srcX = 0;
    let srcY = 0;
    let srcW = image.width;
    let srcH = image.height;
    const crop = opts.crop || null;

    if (crop && crop.mode === "center") {
      const scaleValue = Math.min(1, Math.max(0.1, Number(crop.scale) || 1));
      srcW = Math.max(1, Math.round(image.width * scaleValue));
      srcH = Math.max(1, Math.round(image.height * scaleValue));
      srcX = Math.max(0, Math.round((image.width - srcW) / 2));
      srcY = Math.max(0, Math.round((image.height - srcH) / 2));
    } else if (crop && crop.mode === "normalized") {
      const normalizedX = Math.max(0, Math.min(1, Number(crop.x) || 0));
      const normalizedY = Math.max(0, Math.min(1, Number(crop.y) || 0));
      const normalizedWidth = Math.max(0.01, Math.min(1, Number(crop.width) || 1));
      const normalizedHeight = Math.max(0.01, Math.min(1, Number(crop.height) || 1));

      srcX = Math.max(0, Math.round(image.width * normalizedX));
      srcY = Math.max(0, Math.round(image.height * normalizedY));
      srcW = Math.max(1, Math.round(image.width * normalizedWidth));
      srcH = Math.max(1, Math.round(image.height * normalizedHeight));

      if (srcX + srcW > image.width) {
        srcW = Math.max(1, image.width - srcX);
      }
      if (srcY + srcH > image.height) {
        srcH = Math.max(1, image.height - srcY);
      }
    } else if (crop && Number.isFinite(crop.x) && Number.isFinite(crop.y) && Number.isFinite(crop.width) && Number.isFinite(crop.height)) {
      srcX = Math.max(0, Math.round(Number(crop.x)));
      srcY = Math.max(0, Math.round(Number(crop.y)));
      srcW = Math.max(1, Math.round(Number(crop.width)));
      srcH = Math.max(1, Math.round(Number(crop.height)));
      if (srcX + srcW > image.width) {
        srcW = Math.max(1, image.width - srcX);
      }
      if (srcY + srcH > image.height) {
        srcH = Math.max(1, image.height - srcY);
      }
    }

    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return dataUrl;
    }

    ctx.drawImage(image, srcX, srcY, srcW, srcH, 0, 0, width, height);

    const openCvReady = !!opts.useOpenCv && await window.pmstools.loadOpenCv();
    if (openCvReady) {
      let src = null;
      let gray = null;
      let denoised = null;
      let enhanced = null;
      let binary = null;
      let morph = null;
      let rgba = null;
      let kernel = null;

      try {
        src = window.cv.imread(canvas);
        gray = new window.cv.Mat();
        denoised = new window.cv.Mat();
        enhanced = new window.cv.Mat();
        binary = new window.cv.Mat();
        morph = new window.cv.Mat();
        rgba = new window.cv.Mat();

        window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY, 0);
        const denoiseKernelSize = Math.max(1, Math.min(9, Number(opts.denoiseKernelSize) || 3));
        const normalizedDenoiseKernelSize = denoiseKernelSize % 2 === 0 ? denoiseKernelSize + 1 : denoiseKernelSize;
        window.cv.GaussianBlur(gray, denoised, new window.cv.Size(normalizedDenoiseKernelSize, normalizedDenoiseKernelSize), 0, 0, window.cv.BORDER_DEFAULT);

        const contrast = Number(opts.contrast) || 1.15;
        window.cv.convertScaleAbs(denoised, enhanced, contrast, 0);

        if (typeof window.cv.CLAHE === "function") {
          const clahe = new window.cv.CLAHE(2.0, new window.cv.Size(8, 8));
          try {
            clahe.apply(enhanced, enhanced);
          } finally {
            clahe.delete();
          }
        }

        const useAdaptiveThreshold = !!opts.adaptiveThreshold;
        const threshold = Number(opts.threshold);
        if (!useAdaptiveThreshold && Number.isFinite(threshold)) {
          const clampedThreshold = Math.max(0, Math.min(255, threshold));
          window.cv.threshold(enhanced, binary, clampedThreshold, 255, window.cv.THRESH_BINARY);
        } else {
          const adaptiveBlockSizeRaw = Math.max(3, Math.min(99, Number(opts.adaptiveBlockSize) || 31));
          const adaptiveBlockSize = adaptiveBlockSizeRaw % 2 === 0 ? adaptiveBlockSizeRaw + 1 : adaptiveBlockSizeRaw;
          const adaptiveC = Number.isFinite(Number(opts.adaptiveC)) ? Number(opts.adaptiveC) : 7;
          window.cv.adaptiveThreshold(enhanced, binary, 255, window.cv.ADAPTIVE_THRESH_GAUSSIAN_C, window.cv.THRESH_BINARY, adaptiveBlockSize, adaptiveC);
        }

        const closeKernelSize = Math.max(1, Math.min(7, Number(opts.closeKernelSize) || 2));
        kernel = window.cv.getStructuringElement(window.cv.MORPH_RECT, new window.cv.Size(closeKernelSize, closeKernelSize));
        window.cv.morphologyEx(binary, morph, window.cv.MORPH_CLOSE, kernel);
        window.cv.cvtColor(morph, rgba, window.cv.COLOR_GRAY2RGBA, 0);
        window.cv.imshow(canvas, rgba);

        return canvas.toDataURL("image/jpeg", 0.9);
      } catch (error) {
        console.warn("OpenCV preprocessing failed; falling back to canvas pipeline", error);
      } finally {
        if (src) src.delete();
        if (gray) gray.delete();
        if (denoised) denoised.delete();
        if (enhanced) enhanced.delete();
        if (binary) binary.delete();
        if (morph) morph.delete();
        if (rgba) rgba.delete();
        if (kernel) kernel.delete();
      }
    }

    if (!opts.grayscale && (opts.threshold == null || opts.contrast == null)) {
      return canvas.toDataURL("image/jpeg", 0.9);
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const threshold = Math.max(0, Math.min(255, Number(opts.threshold)));
    const contrast = Number(opts.contrast) || 1;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let gray = (0.299 * r + 0.587 * g + 0.114 * b);
      gray = (gray - 128) * contrast + 128;
      gray = Math.max(0, Math.min(255, gray));

      if (!Number.isNaN(threshold)) {
        gray = gray >= threshold ? 255 : 0;
      }

      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  },
  ocrFromDataUrl: async function (dataUrl, options) {
    if (!dataUrl) {
      return "";
    }

    const loaded = await window.pmstools.loadTesseract();
    if (!loaded) {
      throw new Error("Tesseract not available in this browser");
    }

    const preparedDataUrl = await window.pmstools.preprocessDataUrl(dataUrl, options);
    const lang = (options && options.lang) ? options.lang : "eng";
    const config = {};
    if (options && options.whitelist) {
      config.tessedit_char_whitelist = options.whitelist;
    }
    if (options && options.preserveSpaces) {
      config.preserve_interword_spaces = "1";
    }
    if (options && options.psm != null) {
      config.tessedit_pageseg_mode = String(options.psm);
    }
    if (options && options.dpi != null) {
      config.user_defined_dpi = String(options.dpi);
    }

    if (window.Tesseract && window.Tesseract.createWorker) {
      const loadWorker = typeof pmstoolsLoadTesseractWorker === "function"
        ? pmstoolsLoadTesseractWorker
        : (window.pmstools && typeof window.pmstools.loadTesseractWorker === "function"
          ? window.pmstools.loadTesseractWorker
          : null);

      if (!loadWorker) {
        const result = await window.Tesseract.recognize(preparedDataUrl, lang, config);
        return (result && result.data && result.data.text) ? result.data.text : "";
      }

      const worker = await loadWorker(lang);
      if (!worker) {
        throw new Error("Tesseract worker failed to initialize");
      }

      if (Object.keys(config).length > 0) {
        const configSignature = JSON.stringify(Object.keys(config).sort().map((key) => [key, config[key]]));
        if (worker.__pmstoolsConfigSignature !== configSignature) {
          await worker.setParameters(config);
          worker.__pmstoolsConfigSignature = configSignature;
        }
      }

      const result = await worker.recognize(preparedDataUrl);
      return (result && result.data && result.data.text) ? result.data.text : "";
    }

    if (window.Tesseract && window.Tesseract.recognize) {
      const result = await window.Tesseract.recognize(preparedDataUrl, lang, config);
      return (result && result.data && result.data.text) ? result.data.text : "";
    }

    throw new Error("Tesseract not available in this browser");
  },
  ocrFromVideo: async function (videoId, captureOptions, ocrOptions) {
    const dataUrl = window.pmstools.captureFrameDataUrl(videoId, captureOptions);
    if (!dataUrl) {
      return { text: "", dataUrl: null };
    }

    const text = await window.pmstools.ocrFromDataUrl(dataUrl, ocrOptions || {});
    const includeDataUrl = !!(captureOptions && captureOptions.includeDataUrl);

    if (includeDataUrl) {
      return { text: text || "", dataUrl: dataUrl };
    }

    return { text: text || "", dataUrl: null };
  },
  ocrFromVideoWithFallback: async function (videoId, captureOptions, fastOcrOptions, fallbackOcrOptions, fallbackMinAlphaNumeric) {
    const dataUrl = window.pmstools.captureFrameDataUrl(videoId, captureOptions);
    if (!dataUrl) {
      return { text: "", dataUrl: null, usedFallback: false };
    }

    const countAlphaNumeric = function (value) {
      if (!value) {
        return 0;
      }

      const matches = String(value).match(/[A-Za-z0-9]/g);
      return matches ? matches.length : 0;
    };

    let text = await window.pmstools.ocrFromDataUrl(dataUrl, fastOcrOptions || {});
    let usedFallback = false;
    const minAlphaNumeric = Number.isFinite(Number(fallbackMinAlphaNumeric)) ? Number(fallbackMinAlphaNumeric) : 6;

    if (countAlphaNumeric(text) < minAlphaNumeric) {
      text = await window.pmstools.ocrFromDataUrl(dataUrl, fallbackOcrOptions || {});
      usedFallback = true;
    }

    const includeDataUrl = !!(captureOptions && captureOptions.includeDataUrl);
    return {
      text: text || "",
      dataUrl: includeDataUrl ? dataUrl : null,
      usedFallback: usedFallback
    };
  },
  loadTesseractWorker: pmstoolsLoadTesseractWorker,
  prewarmBurstOcr: async function (lang, includeOpenCv) {
    await pmstoolsPrewarmBurstOcr(lang, !!includeOpenCv);
  },
  renderBarcode: function (svgId, value) {
    const svg = document.getElementById(svgId);
    if (!svg || !value) {
      return;
    }

    if (!window.JsBarcode) {
      return;
    }

    try {
      window.JsBarcode(svg, value, {
        format: "CODE39",
        lineColor: "#151718",
        background: "#ffffff",
        height: 96,
        displayValue: false,
        margin: 0
      });
    } catch (error) {
      console.warn("Barcode render failed", error);
    }
  },
  setupCropSelection: (function () {
    const selectionState = new WeakMap();

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function normalizePoint(element, clientX, clientY) {
      const rect = element.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      return {
        x: clamp((clientX - rect.left) / width, 0, 1),
        y: clamp((clientY - rect.top) / height, 0, 1)
      };
    }

    function toSelection(startPoint, currentPoint) {
      const left = Math.min(startPoint.x, currentPoint.x);
      const top = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      return { left, top, width, height };
    }

    const api = function (element, dotNetRef) {
      if (!element || !dotNetRef) {
        return;
      }

      const existing = selectionState.get(element);
      if (existing) {
        existing.dispose();
      }

      let pointerId = null;
      let startPoint = null;
      let isTouchDragging = false;

      const updateSelection = function (clientX, clientY) {
        if (!startPoint) {
          return;
        }

        const currentPoint = normalizePoint(element, clientX, clientY);
        const selection = toSelection(startPoint, currentPoint);
        dotNetRef.invokeMethodAsync("UpdateCropSelectionFromJs", selection.left, selection.top, selection.width, selection.height);
      };

      const beginSelection = function (clientX, clientY) {
        startPoint = normalizePoint(element, clientX, clientY);
        dotNetRef.invokeMethodAsync("UpdateCropSelectionFromJs", startPoint.x, startPoint.y, 0.001, 0.001);
      };

      const onPointerDown = function (event) {
        if (event.button != null && event.button !== 0) {
          return;
        }

        event.preventDefault();
        pointerId = event.pointerId;
        beginSelection(event.clientX, event.clientY);

        if (typeof element.setPointerCapture === "function") {
          try {
            element.setPointerCapture(pointerId);
          } catch {
            // Ignore capture failures on browsers that expose pointer events partially.
          }
        }
      };

      const onPointerMove = function (event) {
        if (pointerId == null || event.pointerId !== pointerId || !startPoint) {
          return;
        }

        event.preventDefault();
        updateSelection(event.clientX, event.clientY);
      };

      const finishSelection = function (event) {
        if (pointerId == null || event.pointerId !== pointerId) {
          return;
        }

        event.preventDefault();
        if (typeof element.hasPointerCapture === "function" && typeof element.releasePointerCapture === "function") {
          try {
            if (element.hasPointerCapture(pointerId)) {
              element.releasePointerCapture(pointerId);
            }
          } catch {
            // Ignore release failures from inconsistent pointer-capture implementations.
          }
        }

        pointerId = null;
        startPoint = null;
      };

      const onTouchStart = function (event) {
        if (!event.touches || event.touches.length !== 1) {
          return;
        }

        event.preventDefault();
        const touch = event.touches[0];
        beginSelection(touch.clientX, touch.clientY);
        isTouchDragging = true;
      };

      const onTouchMove = function (event) {
        if (!isTouchDragging || !startPoint || !event.touches || event.touches.length !== 1) {
          return;
        }

        event.preventDefault();
        const touch = event.touches[0];
        updateSelection(touch.clientX, touch.clientY);
      };

      const onTouchEnd = function (event) {
        if (!isTouchDragging) {
          return;
        }

        event.preventDefault();
        isTouchDragging = false;
        startPoint = null;
      };

      const onMouseDown = function (event) {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        beginSelection(event.clientX, event.clientY);
      };

      const onMouseMove = function (event) {
        if (!startPoint) {
          return;
        }

        event.preventDefault();
        updateSelection(event.clientX, event.clientY);
      };

      const onMouseUp = function (event) {
        if (!startPoint) {
          return;
        }

        event.preventDefault();
        startPoint = null;
      };

      if (typeof window.PointerEvent === "function") {
        element.addEventListener("pointerdown", onPointerDown);
        element.addEventListener("pointermove", onPointerMove);
        element.addEventListener("pointerup", finishSelection);
        element.addEventListener("pointercancel", finishSelection);
      } else {
        element.addEventListener("touchstart", onTouchStart, { passive: false });
        element.addEventListener("touchmove", onTouchMove, { passive: false });
        element.addEventListener("touchend", onTouchEnd, { passive: false });
        element.addEventListener("touchcancel", onTouchEnd, { passive: false });
        element.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      }

      selectionState.set(element, {
        dispose: function () {
          if (typeof window.PointerEvent === "function") {
            element.removeEventListener("pointerdown", onPointerDown);
            element.removeEventListener("pointermove", onPointerMove);
            element.removeEventListener("pointerup", finishSelection);
            element.removeEventListener("pointercancel", finishSelection);
          } else {
            element.removeEventListener("touchstart", onTouchStart);
            element.removeEventListener("touchmove", onTouchMove);
            element.removeEventListener("touchend", onTouchEnd);
            element.removeEventListener("touchcancel", onTouchEnd);
            element.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
          }

          pointerId = null;
          startPoint = null;
          isTouchDragging = false;
        }
      });
    };

    api.destroy = function (element) {
      if (!element) {
        return;
      }

      const existing = selectionState.get(element);
      if (existing) {
        existing.dispose();
        selectionState.delete(element);
      }
    };

    return api;
  })(),
  destroyCropSelection: function (element) {
    if (window.pmstools.setupCropSelection && typeof window.pmstools.setupCropSelection.destroy === "function") {
      window.pmstools.setupCropSelection.destroy(element);
    }
  },
  closeNavMenu: function (menuId) {
    const menu = document.getElementById(menuId);
    if (menu && menu.open) {
      menu.open = false;
    }
  },
  setupNavMenuCloseOnOutside: function (menuId) {
    const menu = document.getElementById(menuId);
    if (!menu || menu.dataset.outsideCloseBound === "true") {
      return;
    }

    menu.dataset.outsideCloseBound = "true";

    document.addEventListener("click", function (event) {
      if (!menu.open) {
        return;
      }

      if (!menu.contains(event.target)) {
        menu.open = false;
      }
    });
  }
};
