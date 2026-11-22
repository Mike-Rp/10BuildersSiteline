import { Button } from "./ui"
import "./report-export.css"

export default function ReportPdfRecovery() {
  return <div className="report-pdf-recovery" role="alert">
    <p>The PDF exporter could not load. This can happen after a website update or a connection problem.</p>
    <p>Reload the page, reopen this report, and try again. You can also use Print or export CSV.</p>
    <Button onClick={() => window.location.reload()}>Reload page</Button>
  </div>
}
