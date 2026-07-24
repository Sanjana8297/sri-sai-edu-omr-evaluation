/**
 * Browser-only: rasterize each page of a scanned OMR PDF into a JPEG File
 * suitable for /api/teacher/omr-detect.
 */

export const OMR_PDF_MAX_PAGES = 40;
export const OMR_PDF_MAX_BYTES = 50 * 1024 * 1024;

export type OmrPdfPageImage = {
  pageIndex: number;
  file: File;
};

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isOmrScanPdf(file: File): boolean {
  return isPdfFile(file);
}

/**
 * Render each PDF page to a JPEG blob (scale ~2 for readable write-in digits).
 */
export async function pdfFileToOmrPageImages(
  file: File,
  options?: { maxPages?: number; scale?: number; onProgress?: (done: number, total: number) => void }
): Promise<OmrPdfPageImage[]> {
  if (!isPdfFile(file)) {
    throw new Error("Expected a PDF file.");
  }
  if (file.size > OMR_PDF_MAX_BYTES) {
    throw new Error("The OMR PDF must be 50 MB or smaller.");
  }

  const maxPages = options?.maxPages ?? OMR_PDF_MAX_PAGES;
  const scale = options?.scale ?? 2;

  const pdfjs = await import("pdfjs-dist");
  // Keep worker version locked to the installed package.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, disableRange: true, disableStream: true }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  if (doc.numPages === 0) {
    throw new Error("This PDF has no pages.");
  }
  if (doc.numPages > maxPages) {
    throw new Error(
      `This PDF has ${doc.numPages} pages. Upload at most ${maxPages} OMR sheets per batch.`
    );
  }

  const pages: OmrPdfPageImage[] = [];
  const baseName = file.name.replace(/\.pdf$/i, "") || "omr-sheet";

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create a canvas to render the PDF page.");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(`Failed to encode page ${pageNum} as JPEG.`))),
        "image/jpeg",
        0.92
      );
    });

    pages.push({
      pageIndex: pageNum - 1,
      file: new File([blob], `${baseName}-page-${pageNum}.jpg`, { type: "image/jpeg" }),
    });
    options?.onProgress?.(pageNum, pageCount);
  }

  return pages;
}
