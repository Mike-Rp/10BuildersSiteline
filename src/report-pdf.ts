import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces"

// Convert only our own escaped report templates. No HTML, remote assets or
// project record lookups are handed to the PDF engine.
export function reportPdfDefinition(html: string, landscape = false): TDocumentDefinitions {
  const doc = new window.DOMParser().parseFromString(html, "text/html")
  const text = (element: Element) => {
    const copy = element.cloneNode(true) as Element
    copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"))
    return copy.textContent?.trim() || ""
  }
  const content: Content[] = []
  for (const element of Array.from(doc.body.children)) {
    const value = text(element)
    if (element.tagName === "TABLE") {
      const rows = Array.from(element.querySelectorAll("tr"))
      const columns = Math.max(...rows.map(row => row.children.length))
      if (!rows.length || !columns) continue
      const body: TableCell[][] = rows.map(row => Array.from({ length: columns }, (_, index) => {
        const cell = row.children[index]
        return { text: cell ? text(cell) : "", ...(cell?.tagName === "TH" ? { bold: true, fillColor: "#E9EFF6" } : {}) }
      }))
      const widths = landscape
        ? columns > 5 ? [110, ...Array(columns - 1).fill("*")] : Array(columns).fill("*")
        : columns === 3 ? [85, 100, "*"] : columns === 4 ? [85, 100, "*", 60] : Array(columns).fill("*")
      // Keep normal rows together, but allow very long notes to continue onto
      // another page rather than forcing an oversized unbreakable row.
      content.push({ table: { headerRows: 1, widths, body, dontBreakRows: rows.every(row => text(row).length < 500) }, layout: "lightHorizontalLines", fontSize: landscape && columns > 5 ? 8 : 10, margin: [0, 6, 0, 10] })
    } else if (element.tagName === "UL") {
      const items = Array.from(element.children).map(item => text(item))
      if (items.length) content.push({ ul: items, margin: [0, 0, 0, 10] })
    } else if (value) {
      content.push({ text: value, style: element.tagName === "H1" ? "title" : element.tagName === "H2" ? "heading" : "body" })
    }
  }
  return {
    pageSize: "A4", pageOrientation: landscape ? "landscape" : "portrait", pageMargins: [36, 36, 36, 42],
    info: { title: doc.title, author: "SiteCore · 10 Builders" },
    defaultStyle: { font: "Roboto", fontSize: landscape ? 9 : 10, lineHeight: 1.2, color: "#172B4D" },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
      heading: { fontSize: 13, bold: true, margin: [0, 10, 0, 6] },
      body: { margin: [0, 0, 0, 8] },
    },
    footer: (page, pages) => ({ text: `SiteCore · ${page} / ${pages}`, alignment: "right", margin: [36, 12, 36, 0], fontSize: 8, color: "#52637A" }),
    content,
  }
}

export async function createReportPdf(html: string, landscape = false): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake.js"), import("pdfmake/build/vfs_fonts.js"),
  ])
  pdfMake.addVirtualFileSystem(fonts)
  return pdfMake.createPdf(reportPdfDefinition(html, landscape)).getBlob()
}
