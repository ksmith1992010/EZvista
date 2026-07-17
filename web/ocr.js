/*
 * In-browser OCR for photographed measurements / insurance scopes.
 * Tesseract.js is vendored under tess/ (worker + wasm cores + eng model) so
 * this works on jobsite connections with no CDN — same policy as pdf.js.
 * Everything is lazy: nothing loads until the first photo (or scanned PDF)
 * is dropped, then the worker is reused for the rest of the session.
 */
(function (root) {
  "use strict";

  let workerP = null;
  const abs = (p) => new URL(p, root.location.href).href;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("could not load " + src));
      document.head.appendChild(s);
    });
  }

  async function getWorker() {
    if (!workerP) {
      workerP = (async () => {
        if (!root.Tesseract) await loadScript("tess/tesseract.min.js");
        return root.Tesseract.createWorker("eng", 1, {
          workerPath: abs("tess/worker.min.js"),
          corePath: abs("tess"),      // worker picks the right -simd/-lstm core in this dir
          langPath: abs("tess/eng"),
          gzip: true,
        });
      })();
      workerP.catch(() => { workerP = null; });   // allow retry after a failed load
    }
    return workerP;
  }

  // Photo (File/Blob/canvas/dataURL) → recognized text.
  async function ocrImage(input) {
    const worker = await getWorker();
    const { data } = await worker.recognize(input);
    return data.text || "";
  }

  // Scanned (image-only) PDF → recognized text, page by page.
  // Rendered at 2x for OCR-friendly resolution.
  async function ocrPdf(file, onPage) {
    const buf = await file.arrayBuffer();
    const pdf = await root.pdfjsLib.getDocument({ data: buf }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onPage) onPage(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      out.push(await ocrImage(canvas));
    }
    return out.join("\n");
  }

  root.m2eOcr = { ocrImage, ocrPdf };
})(window);
