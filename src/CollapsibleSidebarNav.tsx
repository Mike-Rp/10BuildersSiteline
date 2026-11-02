import { useEffect, useId, useState } from "react"
import { Icon } from "./ui"
import NavigationCount from "./NavigationCount"
import type { NavigationAttention } from "./navigation-attention"
import "./sidebar-categories.css"

type Item = { label: string; icon: string; group?: string }
export default function CollapsibleSidebarNav({ items, page, counts, onNavigate }: {
  items: Item[]; page: string; counts: NavigationAttention; onNavigate: (page: string) => void
}) {
  const groups: { name: string; items: Item[] }[] = []
  for (const item of items) {
    if (item.group || !groups.length) groups.push({ name: item.group || "WORKSPACE", items: [] })
    groups[groups.length - 1].items.push(item)
  }
  const current = groups.find(group => group.items.some(item => item.label === page))?.name || groups[0]?.name
  const [expanded, setExpanded] = useState<string | undefined>(current)
  const prefix = useId()
  useEffect(() => { setExpanded(current) }, [current, page])
  const icons: Record<string, string> = { WORKSPACE: "grid", RESOURCES: "folder", ORGANIZATION: "users" }
  return <nav className="sidebar-categories" aria-label="Main navigation">
    {groups.map((group, index) => {
      const open = expanded === group.name
      const count = group.items.reduce((sum, item) => sum + (counts[item.label]?.count || 0), 0)
      const title = group.name[0] + group.name.slice(1).toLowerCase()
      const id = `${prefix}-category-${index}`
      return <section className="sidebar-category" key={group.name}>
        <button type="button" className="sidebar-category-toggle" aria-expanded={open} aria-controls={id} onClick={() => setExpanded(open ? undefined : group.name)}>
          <Icon name={icons[group.name] || "folder"} size={19} /><span>{title}</span>
          {!open && <NavigationCount item={{ count, description: "attention items across this category's modules" }} />}
          <span className="category-chevron" aria-hidden="true">{open ? "⌄" : "›"}</span>
        </button>
        <div id={id} hidden={!open} className="sidebar-category-items">
          {group.items.map(item => <button type="button" key={item.label} aria-label={item.label} aria-current={page === item.label ? "page" : undefined}
            aria-description={counts[item.label]?.count ? `${counts[item.label].count} ${counts[item.label].description}` : undefined}
            className={`nav-item ${page === item.label ? "active" : ""}`} onClick={() => onNavigate(item.label)}>
            <Icon name={item.icon} size={19} /><span>{item.label}</span><NavigationCount item={counts[item.label]} />
            {item.label === "Dashboard" && page === item.label && <i />}
          </button>)}
        </div>
      </section>
    })}
  </nav>
}
