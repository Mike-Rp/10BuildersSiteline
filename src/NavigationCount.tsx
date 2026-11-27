import type { NavigationAttention } from "./navigation-attention"

export default function NavigationCount({ item, compact = false }: { item?: NavigationAttention[string]; compact?: boolean }) {
  if (!item || item.count <= 0) return null
  const label = `${item.count} ${item.description}`
  return <b className="nav-count" title={label} aria-label={label}>{compact && item.count > 99 ? "99+" : item.count}</b>
}
