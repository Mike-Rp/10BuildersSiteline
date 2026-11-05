import { MAX_UPLOAD_BYTES } from "./model.ts"

// A phone photo is often larger than the upload limit. Instead of rejecting it, the browser re-draws it smaller
// (as a JPEG) until it fits. Only a JPG or PNG over the limit is touched; everything else is returned as chosen.
const SHRINK_STEPS = [
  { edge: 2400, quality: 0.85 },
  { edge: 2000, quality: 0.8 },
  { edge: 1600, quality: 0.75 },
  { edge: 1280, quality: 0.7 },
]

export const isShrinkable = (file: { name: string; type: string; size: number }, max = MAX_UPLOAD_BYTES) =>
  file.size > max && (/^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name))

export function fittedSize(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export const jpegName = (name: string) => name.replace(/\.[^.]+$/, "") + ".jpg"

export async function fitImageToLimit(file: File, max = MAX_UPLOAD_BYTES): Promise<File> {
  if (!isShrinkable(file, max)) return file
  try {
    const bitmap = await createImageBitmap(file)
    try {
      for (const step of SHRINK_STEPS) {
        const { width, height } = fittedSize(bitmap.width, bitmap.height, step.edge)
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
        if (!context) return file
        // A transparent PNG would turn black as a JPEG.
        context.fillStyle = "#fff"
        context.fillRect(0, 0, width, height)
        context.drawImage(bitmap, 0, 0, width, height)
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", step.quality))
        if (blob && blob.size <= max)
          return new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified })
      }
    } finally {
      bitmap.close()
    }
  } catch {
    /* An unreadable image is left as chosen; the normal size check then explains the problem. */
  }
  return file
}
