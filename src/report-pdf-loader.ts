type PdfExporter = { createReportPdf: (html: string, landscape?: boolean) => Promise<Blob> }

export class PdfExporterLoadError extends Error {
  constructor() {
    super("The PDF exporter could not load. Reload the page, reopen the report, and try again.")
    this.name = "PdfExporterLoadError"
  }
}

export function isPdfModuleLoadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /JavaScript MIME|MIME type|dynamically imported module|Importing a module script failed|module script.*failed|Loading chunk .+ failed|Failed to load module script/i.test(message)
}

// Covers both the report chunk and the PDF engine/font chunks it imports.
// Retrying a rejected module URL in the same tab can reuse the failed import.
export async function createReportPdfSafely(html: string, landscape = false,
  load: () => Promise<PdfExporter> = () => import("./report-pdf")): Promise<Blob> {
  try {
    const exporter = await load()
    return await exporter.createReportPdf(html, landscape)
  } catch (error) {
    if (isPdfModuleLoadFailure(error)) throw new PdfExporterLoadError()
    throw error
  }
}
