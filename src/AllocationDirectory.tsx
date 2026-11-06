import { useEffect, useState } from "react"
import { api } from "./api/client"
import { Badge, Button, Field, Modal } from "./ui"
import PhaseAllocationPanel from "./PhaseAllocationPanel"

export default function AllocationDirectory({
  onChanged,
}: {
  onChanged?: () => unknown
}) {
  const [rows, setRows] = useState<{
    id: number
    project_id: string
    project_name: string
    status: string
    reason: string
    requested_by_name: string
  }[]>([])
  const [opened, setOpened] = useState(false),
    [error, setError] = useState(""),
    [project, setProject] = useState<string>(),
    [filter, setFilter] = useState("pending_admin")
  const refresh = async () => {
    try {
      setRows(await api("/allocation-requests"))
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
    const timer=window.setInterval(()=>void refresh(),30000)
    const onFocus=()=>void refresh()
    window.addEventListener('focus',onFocus)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)}
  }, [])
  return (
    <section className="detail-section">
      <div className="trade-heading">
        <h3>Project allocation requests</h3>
        <Button
          onClick={() => {
            setOpened((v) => !v)
            void refresh()
          }}
        >
          {opened ? "Hide requests" : "Review requests"} (
          {rows.filter((r) => r.status === "pending_admin").length} pending)
        </Button>
      </div>
      <p>
        Admin approval is required to add or replace a company on an existing
        project allocation. Directory approval alone does not approve a project
        request.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {opened && (
        <>
          <Field label="Request status">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="pending_admin">Pending Admin approval</option>
              <option value="all">All requests and decisions</option>
            </select>
          </Field>
          {rows
            .filter((r) => filter === "all" || r.status === filter)
            .map((r) => (
              <article className="history-row" key={r.id}>
                <div>
                  <strong>{r.project_name}</strong>
                  <p>
                    {r.reason} · {r.requested_by_name}
                  </p>
                  <Badge>{r.status.replace(/_/g, " ")}</Badge>
                </div>
                <Button onClick={() => setProject(r.project_id)}>
                  Review request #{r.id}
                </Button>
              </article>
            ))}
          {!rows.some((r) => filter === "all" || r.status === filter) && (
            <p>No matching allocation requests.</p>
          )}
        </>
      )}
      {project && (
        <Modal
          title="Project subcontractor allocation"
          wide
          onClose={() => setProject(undefined)}
        >
          <PhaseAllocationPanel
            projectId={project}
            admin
            onReload={async () => {
              await refresh()
              await onChanged?.()
            }}
          />
        </Modal>
      )}
    </section>
  )
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
