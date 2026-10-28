import { useState } from "react"
import { Button } from "./ui"
import "./report-export.css"

export type ReportExportFormat = "pdf" | "csv" | "print"

export default function ReportExportActions({ disabled, busy, onExport }: {
  disabled: boolean
  busy: boolean
  onExport: (format: ReportExportFormat) => void
}) {
  const [format, setFormat] = useState<"pdf" | "csv">("pdf")
  return <div className="report-export-actions" role="group" aria-label="Report export">
    <Button disabled={disabled || busy} onClick={() => onExport("print")}>Print</Button>
    <label>File format
      <select value={format} disabled={busy} onChange={event => setFormat(event.target.value as "pdf" | "csv")}>
        <option value="pdf">PDF document (.pdf)</option>
        <option value="csv">CSV spreadsheet (.csv)</option>
      </select>
    </label>
    <Button variant="primary" icon="download" disabled={disabled || busy} onClick={() => onExport(format)}>
      {busy ? "Preparing…" : format === "pdf" ? "Download PDF" : "Export CSV"}
    </Button>
  </div>
}
