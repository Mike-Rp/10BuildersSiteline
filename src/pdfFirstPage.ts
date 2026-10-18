// Browser PDF viewers show their own toolbar (Download/Print/Add to Drive).
// Only Chromium desktop browsers (Chrome, Edge, Brave) honour "#toolbar=0".
// Everywhere else (Firefox, Safari, mobile) we render page 1 to an image instead.
type NavigatorLike = {
  userAgentData?: unknown
  pdfViewerEnabled?: boolean
}

export function canHideNativePdfToolbar(nav: NavigatorLike): boolean {
  return !!nav.userAgentData && nav.pdfViewerEnabled === true
}

/** Renders the first page of a PDF (blob/object URL) to a PNG data URL. pdf.js loads lazily. */
export async function renderPdfFirstPage(
  url: string,
  maxWidth = 900,
): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ url })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (maxWidth / base.width) * ratio
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement("canvas")
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL("image/png")
  } finally {
    await task.destroy()
  }
}
