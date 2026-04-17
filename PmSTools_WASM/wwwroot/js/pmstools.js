window.pmstools = {
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

    if (!window.Tesseract || !window.Tesseract.recognize) {
      throw new Error("Tesseract not loaded");
    }

    const result = await window.Tesseract.recognize(dataUrl, "eng");
    return (result && result.data && result.data.text) ? result.data.text : "";
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
