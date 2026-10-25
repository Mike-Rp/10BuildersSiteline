import { useState } from "react"
import type { Doc } from "./model"
import { dateLabel } from "./model"
import { Badge, Button, Icon } from "./ui"

export default function SitePhotoGallery({ photos, onPreview, onRelease }: {
  photos: Doc[]
  onPreview: (doc: Doc) => void
  onRelease?: (photoId: string) => Promise<unknown>
}) {
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  return <>
    <p>New photos stay internal until the assigned Office PM or an Administrator releases them to the client. Existing internal records require review before release.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!photos.length && <p>No site photos uploaded yet.</p>}
    {photos.map(doc => <div className="photo-gallery-record" key={doc.id}>
      <button className="assignment-history" onClick={() => onPreview(doc)}>
        <Icon name="doc" />
        <span><strong>{doc.name}</strong><Badge tone={doc.clientVisible ? "green" : "amber"}>{doc.clientVisible ? "Client-visible" : "Internal · not released"}</Badge><small>{dateLabel(doc.date)} · {doc.owner}</small></span>
        <Icon name="search" size={18} />
      </button>
      {!doc.clientVisible && onRelease && <Button disabled={!!saving} onClick={async () => {
        setSaving(doc.id)
        setError("")
        try { await onRelease(doc.id) }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Photo release failed. Try again.") }
        finally { setSaving("") }
      }}>{saving === doc.id ? "Releasing…" : "Release to client"}</Button>}
    </div>)}
  </>
}
