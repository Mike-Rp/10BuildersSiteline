import { useEffect, useState } from "react"
import { downloadApiFile } from "./api/client"
import type { Doc } from "./model"

// Inline thumbnail for an image attachment, loaded through the authorised file route. Non-images render nothing.
export default function AttachmentPreview({ doc, onOpen }: { doc: Doc; onOpen?: () => void }) {
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(doc.name) || /^image\//.test(doc.mime || "")
  const [url, setUrl] = useState("")
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!isImage) return
    let active = true
    let objectUrl = ""
    downloadApiFile(doc.id).then(file => {
      if (!active) return
      if (file) { objectUrl = URL.createObjectURL(file); setUrl(objectUrl) } else setFailed(true)
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [doc.id, isImage])
  if (!isImage) return null
  if (failed) return <p className="role-muted" role="status">Preview unavailable for {doc.name}. Use View to open it.</p>
  return <button type="button" className="attachment-thumb" onClick={onOpen} aria-label={`Open ${doc.name}`}>
    {url ? <img src={url} alt={doc.name} /> : <span role="status">Loading preview…</span>}
  </button>
}
