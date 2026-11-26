import { matchingInquiryTags } from "../Thesis-Backend/src/domain/inquiry-lead.js"

export default function AssignedScopeMatch({ assigned, qualified }: {
  assigned?: string[]; qualified: string[]
}) {
  const matched = matchingInquiryTags(assigned, qualified)
  const valid = matched.length > 0
  return <span className={`inquiry-pill ${valid ? "ready" : "pending"}`}
    title="Checks every assigned responsibility against this engineer’s verified phase qualifications. Whole-phase coverage is shown separately.">
    {valid ? "100% assigned scope match" : assigned?.length ? "Assigned scope needs review" : "Select an assigned scope"}
  </span>
}
