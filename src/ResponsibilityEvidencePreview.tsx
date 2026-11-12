import { useEffect, useState } from "react"
import { downloadBlob } from "./api/client"
import { Button, Modal } from "./ui"

export default function ResponsibilityEvidencePreview({ path, title, onClose, onDownload }: {
  path: string; title: string; onClose: () => void; onDownload: () => void
}) {
  const [file, setFile] = useState<{ url: string; type: string }>()
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true, url = ""
    void downloadBlob(path).then(blob => {
      if (!active) return
      if (!blob) throw new Error("Evidence unavailable.")
      url = URL.createObjectURL(blob)
      setFile({ url, type: blob.type.split(";")[0].toLowerCase() })
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Evidence preview unavailable.") })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [path])
  return <Modal title="Completion evidence" subtitle={title} wide onClose={onClose}>
    {error ? <p role="alert">{error}</p> : !file ? <p role="status">Loading evidence…</p> :
      ["image/png", "image/jpeg"].includes(file.type) ? <img className="file-preview" src={file.url} alt={`Completion evidence for ${title}`} /> :
      file.type === "application/pdf" ? <object className="pdf-preview large" data={file.url} type="application/pdf"><p>PDF preview is unavailable in this browser. Use Download evidence to open the file.</p></object> :
      <p>Preview is unavailable for this file type. Use Download evidence to open the original.</p>}
    <div className="modal-actions"><Button onClick={onClose}>Close</Button><Button disabled={!file || !!error} onClick={onDownload}>Download evidence</Button></div>
  </Modal>
}
