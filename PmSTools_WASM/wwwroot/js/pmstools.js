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
  startCamera: async function (videoId) {
    const video = document.getElementById(videoId);
    if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

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
  captureFrameDataUrl: function (videoId) {
    const video = document.getElementById(videoId);
    if (!video) {
      return null;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/png");
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

    const openCvReady = await window.pmstools.loadOpenCv();
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

        return canvas.toDataURL("image/png");
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
      return canvas.toDataURL("image/png");
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
    return canvas.toDataURL("image/png");
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

    if (window.Tesseract && window.Tesseract.recognize) {
      const result = await window.Tesseract.recognize(preparedDataUrl, lang, config);
      return (result && result.data && result.data.text) ? result.data.text : "";
    }

    if (window.Tesseract && window.Tesseract.createWorker) {
      const worker = await window.pmstools.loadTesseractWorker(lang);
      if (!worker) {
        throw new Error("Tesseract worker failed to initialize");
      }

      if (Object.keys(config).length > 0) {
        await worker.setParameters(config);
      }

      const result = await worker.recognize(preparedDataUrl);
      return (result && result.data && result.data.text) ? result.data.text : "";
    }

    throw new Error("Tesseract not available in this browser");
  },
  loadTesseractWorker: (async function () {
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
  })(),
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

      const onPointerDown = function (event) {
        if (event.button != null && event.button !== 0) {
          return;
        }

        event.preventDefault();
        pointerId = event.pointerId;
        startPoint = normalizePoint(element, event.clientX, event.clientY);
        element.setPointerCapture(pointerId);
        dotNetRef.invokeMethodAsync("UpdateCropSelectionFromJs", startPoint.x, startPoint.y, 0.001, 0.001);
      };

      const onPointerMove = function (event) {
        if (pointerId == null || event.pointerId !== pointerId || !startPoint) {
          return;
        }

        event.preventDefault();
        const currentPoint = normalizePoint(element, event.clientX, event.clientY);
        const selection = toSelection(startPoint, currentPoint);
        dotNetRef.invokeMethodAsync("UpdateCropSelectionFromJs", selection.left, selection.top, selection.width, selection.height);
      };

      const finishSelection = function (event) {
        if (pointerId == null || event.pointerId !== pointerId) {
          return;
        }

        event.preventDefault();
        if (element.hasPointerCapture(pointerId)) {
          element.releasePointerCapture(pointerId);
        }

        pointerId = null;
        startPoint = null;
      };

      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("pointermove", onPointerMove);
      element.addEventListener("pointerup", finishSelection);
      element.addEventListener("pointercancel", finishSelection);

      selectionState.set(element, {
        dispose: function () {
          element.removeEventListener("pointerdown", onPointerDown);
          element.removeEventListener("pointermove", onPointerMove);
          element.removeEventListener("pointerup", finishSelection);
          element.removeEventListener("pointercancel", finishSelection);
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
