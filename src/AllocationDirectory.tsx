import { useEffect, useState } from "react"
import { api } from "./api/client"
import type { Event } from "./model"
import { Badge, Button, Field, Icon } from "./ui"
import "./allocation-history.css"

type AllocationChange = {
  action: "Added" | "Replaced"
  previousCompany?: string
  company: string
  phases: string[]
}

type AllocationRecord = {
  id: string
  projectName: string
  leadName: string
  date: string
  reason: string
  status: string
  changes: AllocationChange[]
}

type HistoryPage = { records: AllocationRecord[]; hasMore: boolean }

const titles = ["New Subcontractor Assigned", "Subcontractor Allocation Updated"]
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })

export const isAllocationNotification = (event: Event) => titles.includes(event.title)

function useHistory(query: string, enabled = true) {
  const [state, setState] = useState<{ query: string; page?: HistoryPage; error?: string }>()
  useEffect(() => {
    if (!enabled) return
    const abort = new AbortController()
    api<HistoryPage>(`/allocation-history?${query}`, { signal: abort.signal })
      .then(page => { if (!abort.signal.aborted) setState({ query, page }) })
      .catch(error => { if (!abort.signal.aborted) setState({ query, error: error.message }) })
    return () => abort.abort()
  }, [enabled, query])
  return enabled && state?.query === query ? state : undefined
}

function AllocationRecordDetails({ record }: { record: AllocationRecord }) {
  return <article className="allocation-history-record">
    <header>
      <h4>{record.projectName}</h4>
      <Badge tone="green">{record.status}</Badge>
    </header>
    <p>{record.leadName} · Lead Site PM · <time dateTime={record.date}>{dateTime.format(new Date(record.date))}</time></p>
    <ul>{record.changes.map(change => <li key={JSON.stringify([change.action, change.previousCompany, change.company, change.phases])}>
      <Badge tone={change.action === "Replaced" ? "amber" : "blue"}>{change.action}</Badge>{" "}
      {change.previousCompany && <>{change.previousCompany} → </>}<strong>{change.company}</strong>
      <p>{change.phases.join(", ")}</p>
    </li>)}</ul>
    {record.reason && record.changes.some(change => change.action === "Replaced") && <p><strong>Replacement reason</strong> {record.reason}</p>}
  </article>
}

export function AllocationNotificationDetails({ event }: { event: Event }) {
  const history = useHistory(new URLSearchParams({ notificationId: event.id }).toString())
  return history?.error ? <p role="alert">{history.error}</p>
    : history?.page ? history.page.records.length
      ? history.page.records.map(record => <AllocationRecordDetails key={record.id} record={record} />)
      : <p>Allocation history is unavailable for this project.</p>
    : <p role="status">Loading allocation change…</p>
}

export function AllocationChangeBanner({ events, onRead, onOpen }: {
  events: Event[]
  onRead: (ids: string[]) => void
  onOpen: (event: Event) => void
}) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const latest = events.reduce<Event | undefined>((current, event) =>
    !event.read && !dismissed.includes(event.id) && isAllocationNotification(event) &&
    (!current || Date.parse(event.date) > Date.parse(current.date)) ? event : current, undefined)
  if (!latest) return null
  const dismiss = () => {
    setDismissed(ids => [...ids, latest.id])
    onRead([latest.id])
  }
  return <section aria-label="Latest subcontractor allocation update"
    className={`allocation-change-banner${latest.title === titles[1] ? " replacement" : ""}`}>
    <Icon name="building" />
    <div>
      <h2>{latest.title}</h2>
      <p>{latest.detail}</p>
      <time dateTime={latest.date}>{dateTime.format(new Date(latest.date))}</time>
    </div>
    <div className="allocation-change-actions">
      <Button onClick={() => { dismiss(); onOpen(latest) }}>View details</Button>
      <Button variant="icon-button" icon="close" aria-label="Dismiss allocation update" onClick={dismiss} />
    </div>
  </section>
}

export default function AllocationDirectory({ projectId }: { projectId?: string }) {
  const [opened, setOpened] = useState(false)
  const [filters, setFilters] = useState({ search: "", action: "", from: "", to: "", page: "1" })
  const update = (key: keyof typeof filters, value: string) => setFilters(previous => ({ ...previous, page: "1", [key]: value }))
  const query = new URLSearchParams(Object.entries({ ...filters, projectId: projectId ?? "" }).filter(([, value]) => value)).toString()
  const validRange = !filters.from || !filters.to || filters.from <= filters.to
  const history = useHistory(query, opened && validRange)
  return <section className="detail-section allocation-history">
    <div className="trade-heading">
      <h3>Subcontractor allocation history</h3>
      <Button aria-expanded={opened} onClick={() => setOpened(value => !value)}>{opened ? "Hide history" : "View history"}</Button>
    </div>
    {opened && <>
      <div className="allocation-history-filters">
        {!projectId && <Field label="Search by project"><input type="search" value={filters.search} onChange={event => update("search", event.target.value)} /></Field>}
        <Field label="Action type"><select value={filters.action} onChange={event => update("action", event.target.value)}>
          <option value="">All actions</option><option>Added</option><option>Replaced</option>
        </select></Field>
        <Field label="From date"><input type="date" value={filters.from} onChange={event => update("from", event.target.value)} /></Field>
        <Field label="To date"><input type="date" value={filters.to} onChange={event => update("to", event.target.value)} /></Field>
      </div>
      {!validRange ? <p role="alert">Choose an end date on or after the start date.</p>
        : history?.error ? <p role="alert">{history.error}</p>
        : history?.page ? history.page.records.length
          ? history.page.records.map(record => <AllocationRecordDetails key={record.id} record={record} />)
          : <p>No matching allocation changes.</p>
        : <p role="status">Loading allocation history…</p>}
      {validRange && (Number(filters.page) > 1 || history?.page?.hasMore) && <div className="allocation-change-actions">
        <Button disabled={filters.page === "1"} onClick={() => update("page", String(Number(filters.page) - 1))}>Previous</Button>
        <span>Page {filters.page}</span>
        <Button disabled={!history?.page?.hasMore} onClick={() => update("page", String(Number(filters.page) + 1))}>Next</Button>
      </div>}
    </>}
  </section>
}
export function CompanyProjectPhases({ companyId }: { companyId: string }) {
  const [rows, setRows] =
      useState<{
        project_id: string
        project_name: string
        phase: string
        foreman_name: string
        foreman_phone: string
        lifecycle_status: string
      }[]>(),
    [error, setError] = useState("")
  return (
    <section className="detail-section">
      <h3>Project phase assignments</h3>
      <p>
        Read-only. Phase responsibilities are assigned by the Lead Site PM
        within the project.
      </p>
      <Button
        onClick={() => {
          api<typeof rows>(`/subcontractors/${companyId}/phase-assignments`)
            .then(setRows)
            .catch((e) => setError(e.message))
        }}
      >
        View project assignments
      </Button>
      {error && <p role="alert">{error}</p>}
      {rows?.map((row) => (
        <div className="history-row" key={row.project_id + row.phase}>
          <div>
            <strong>
              {row.project_name} · {row.phase}
            </strong>
            <p>
              {row.foreman_name} ·{" "}
              <a href={`tel:${row.foreman_phone}`}>{row.foreman_phone}</a> ·{" "}
              {row.lifecycle_status}
            </p>
          </div>
        </div>
      ))}
      {rows?.length === 0 && (
        <p>
          No phase-level foreman records. Existing legacy allocations remain
          available in the project record.
        </p>
      )}
    </section>
  )
}
