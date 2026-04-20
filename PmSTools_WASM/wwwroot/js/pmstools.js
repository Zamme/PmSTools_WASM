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
  ocrFromDataUrl: async function (dataUrl) {
    if (!dataUrl) {
      return "";
    }

    const loaded = await window.pmstools.loadTesseract();
    if (!loaded) {
      throw new Error("Tesseract not available in this browser");
    }

    if (window.Tesseract && window.Tesseract.recognize) {
      const result = await window.Tesseract.recognize(dataUrl, "eng");
      return (result && result.data && result.data.text) ? result.data.text : "";
    }

    if (window.Tesseract && window.Tesseract.createWorker) {
      const worker = await window.pmstools.loadTesseractWorker();
      if (!worker) {
        throw new Error("Tesseract worker failed to initialize");
      }

      const result = await worker.recognize(dataUrl);
      return (result && result.data && result.data.text) ? result.data.text : "";
    }

    throw new Error("Tesseract not available in this browser");
  },
  loadTesseractWorker: (async function () {
    let workerPromise = null;

    return async function () {
      if (!window.Tesseract || !window.Tesseract.createWorker) {
        return null;
      }

      if (!workerPromise) {
        workerPromise = (async () => {
          const worker = await window.Tesseract.createWorker({
            logger: () => {}
          });
          await worker.loadLanguage("eng");
          await worker.initialize("eng");
          return worker;
        })();
      }

      return workerPromise;
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
        background: "transparent",
        height: 64,
        displayValue: false,
        margin: 0
      });
    } catch (error) {
      console.warn("Barcode render failed", error);
    }
  }
};
