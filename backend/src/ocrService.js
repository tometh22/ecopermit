const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { createCanvas } = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");

const OCR_LANG = process.env.OCR_LANG || "spa+eng";
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 0);
const OCR_SCALE = Number(process.env.OCR_SCALE || 2);

const renderPageToBuffer = async (page, scale) => {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer("image/png");
};

const extractTextWithOcr = async (buffer, logger) => {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, disableWorker: true });
  const pdf = await loadingTask.promise;
  const totalPages = OCR_MAX_PAGES > 0 ? Math.min(pdf.numPages, OCR_MAX_PAGES) : pdf.numPages;

  const worker = await createWorker({
    logger: (m) => logger && logger(m),
  });
  await worker.loadLanguage(OCR_LANG);
  await worker.initialize(OCR_LANG);

  let text = "";
  for (let i = 1; i <= totalPages; i += 1) {
    const page = await pdf.getPage(i);
    const image = await renderPageToBuffer(page, OCR_SCALE);
    const result = await worker.recognize(image);
    text += `\n${result.data.text || ""}`;
  }

  await worker.terminate();
  return { text, pages: totalPages };
};

module.exports = {
  extractTextWithOcr,
};
