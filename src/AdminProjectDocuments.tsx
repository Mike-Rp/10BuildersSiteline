import type { Doc, Project } from "./model"
import { DocumentList, downloadDoc } from "./panels"
import { Button, Modal } from "./ui"
import "./admin-project-documents.css"

export default function AdminProjectDocuments({ project, onPreview, onClose, onDownloadsRequested }: {
  project: Project
  onPreview: (doc: Doc) => void
  onClose: () => void
  onDownloadsRequested: () => void
}) {
  return <Modal title="Project Documents" subtitle={project.name} onClose={onClose} wide>
    <div className="admin-project-document-popup">
      <div className="section-title"><h3>Registered Documents</h3>{project.docs.some(doc => doc.uploaded) && <Button icon="download" onClick={async () => {
        for (const doc of project.docs.filter(doc => doc.uploaded)) await downloadDoc(doc)
        onDownloadsRequested()
      }}>Download all</Button>}</div>
      <p className="section-description">Registered documents belong to the Office PM and Lead Site PM. Administrator can view and download, not upload on their behalf.</p>
      <DocumentList docs={project.docs} onPreview={onPreview} />
    </div>
    <div className="modal-actions"><Button onClick={onClose}>Close</Button></div>
  </Modal>
}
