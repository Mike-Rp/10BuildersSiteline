import { useState } from "react"
import { CLIENT_PHOTO_EXAMPLES } from "./client-photo-examples"
import { Badge, Modal } from "./ui"

export default function ClientSamplePhotos({ compact = false, projectName }: { compact?: boolean; projectName: string }) {
  const [selected, setSelected] = useState<string>()
  const photo = CLIENT_PHOTO_EXAMPLES.find(item => item.id === selected)
  return <div className={`client-sample-photos ${compact ? "compact" : ""}`}>
    <p className="client-photo-example-note"><Badge>Sample photos</Badge><span>Illustrative examples, not project uploads.</span></p>
    <div className={compact ? "client-photos-grid client-photos-collage photos-3" : "client-photos-grid"} aria-label="Illustrative construction photo examples">
      {CLIENT_PHOTO_EXAMPLES.map(item => <button key={item.id} type="button" className="client-photo" aria-label={`View sample photo: ${item.title}`} onClick={() => setSelected(item.id)}>
        <img src={item.src} alt={item.alt} loading="lazy" /><div><strong>{item.title}</strong><small>Illustrative sample</small></div>
      </button>)}
    </div>
    {photo && <Modal wide title={`Sample photo — ${photo.title}`} subtitle="AI-generated illustration · not a recorded project upload" onClose={() => setSelected(undefined)}>
      <img className="client-sample-preview" src={photo.src} alt={photo.alt} />
      <p className="client-sample-caption">This is an illustrative construction example. It does not document work or progress at {projectName}.</p>
    </Modal>}
  </div>
}
