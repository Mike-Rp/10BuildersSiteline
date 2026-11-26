import { matchingInquiryTags } from "../Thesis-Backend/src/domain/inquiry-lead.js"

export default function AssignedScopeMatch({ assigned, qualified, compact = false }: {
  assigned?: string[]; qualified: string[]; compact?: boolean
}) {
  const matched = matchingInquiryTags(assigned, qualified)
  const valid = matched.length > 0
  return <span className={`inquiry-pill ${valid ? "ready" : "pending"}`}
    title="Checks every assigned responsibility against this engineer’s verified phase qualifications. Whole-phase coverage is shown separately.">
    {compact ? valid ? "100% match" : "Review scopes" : valid ? "100% assigned scope match" : assigned?.length ? "Assigned scope needs review" : "Select an assigned scope"}
  </span>
}
