import type { Account } from "./model.ts"
import type { ClientProjectView } from "./client-access.ts"

// Frontend examples only. Never merge these assets into project photos or evidence.
export const CLIENT_PHOTO_EXAMPLES = [
  { id: "foundation-overview", title: "Foundation overview", src: "/images/client-sample-foundation.webp", alt: "Illustrative construction example: concrete foundation, column reinforcing bars and formwork." },
  { id: "reinforcement-detail", title: "Reinforcement detail", src: "/images/client-sample-reinforcement.webp", alt: "Illustrative construction example: tied steel reinforcement inside timber foundation formwork." },
  { id: "ground-slab", title: "Ground slab works", src: "/images/client-sample-slab.webp", alt: "Illustrative construction example: unfinished ground slab with column starter bars." },
] as const

export function canShowClientPhotoExamples(actor: Pick<Account, "email" | "status">, project?: Pick<ClientProjectView, "photos">) {
  return actor.status === "active" && actor.email.trim().toLowerCase() === "gonzales.vialh@10builders.com" && !!project && project.photos.length === 0
}
