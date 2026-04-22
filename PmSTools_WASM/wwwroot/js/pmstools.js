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
  preprocessDataUrl: async function (dataUrl, options) {
    const opts = Object.assign({
      preprocess: true,
      maxDim: 1600,
      grayscale: true,
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
  }
  ,
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
