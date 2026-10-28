import type { NavigationAttention } from "./navigation-attention"

export default function NavigationCount({ item }: { item?: NavigationAttention[string] }) {
  if (!item || item.count <= 0) return null
  const label = `${item.count} ${item.description}`
  return <b className="nav-count" title={label} aria-label={label}>{item.count}</b>
}
