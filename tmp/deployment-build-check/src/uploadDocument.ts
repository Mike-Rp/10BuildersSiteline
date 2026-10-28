import { today, type Doc } from "./model.ts"

/**
 * The document record created by the shared Upload component. Uploads are internal unless the caller says
 * otherwise. Site photos also start internal and require an authorized release.
 */
export function newUploadedDoc(input: {
  id: string
  label: string
  file: { name: string; size: number; type: string }
  owner: string
  clientVisible?: boolean
}): Doc {
  return {
    id: input.id,
    label: input.label,
    name: input.file.name,
    uploaded: true,
    clientVisible: input.clientVisible === true,
    owner: input.owner,
    date: today(),
    size: input.file.size,
    mime: input.file.type,
  }
}
