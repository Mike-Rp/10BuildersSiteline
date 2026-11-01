import { useEffect, useState } from "react"
import { api } from "./api/client"
import {
  submitOwnRenewal,
  openRenewalFile,
  verifyRenewal,
  rejectRenewal,
} from "./api/licenses"
import {
  PROFESSIONS,
  ENGINEER_SPECIALIZATIONS,
  SPECIALIZATION_PROFESSIONS,
  licenseNumberError,
} from "../Thesis-Backend/src/domain/engineer-credentials.js"
import { Button, Field } from "./ui"
import { dateLabel } from "./model"
type Credential = {
  id: string
  profession: string | null
  license_number: string
  license_expiry: string
  verification_status: string
  expiryStatus: string
  eligible: boolean
  needsReview: boolean
  superseded_at: string | null
  verified_by_name?: string
  verified_at?: string
  verification_note?: string
}
type Submission = {
  id: number
  profession: string | null
  license_number: string
  license_expiry: string
  status: string
  submitted_at: string
  reviewed_at?: string
  reviewed_by_name?: string
  review_note?: string
}
type Summary = {
  accountStatus: string
  credentials: Credential[]
  submissions: Submission[]
  specializations: {
    specialization: string
    recorded_by_name: string
    recorded_at: string
  }[]
  qualifiedRequirements: string[]
  eligibleForNewAssignment: boolean
  eligibilityNote: string
}
export default function EngineerCredentials({
  userId,
  admin = false,
  onChanged,
}: {
  userId: string
  admin?: boolean
  onChanged?: () => void
}) {
  const [data, setData] = useState<Summary>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const [profession, setProfession] = useState(""),
    [number, setNumber] = useState(""),
    [expiry, setExpiry] = useState(""),
    [file, setFile] = useState<File>()
  const [specializations, setSpecializations] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [reviewProfession, setReviewProfession] = useState("")
  const [reviewId, setReviewId] = useState<number>()
  async function refresh() {
    const next = await api<Summary>("/licenses/credentials/" + userId)
    setData(next)
    setSpecializations(next.specializations.map((s) => s.specialization))
  }
  useEffect(() => {
    let live = true
    setData(undefined)
    setError("")
    api<Summary>("/licenses/credentials/" + userId)
      .then((next) => {
        if (live) {
          setData(next)
          setSpecializations(next.specializations.map((s) => s.specialization))
        }
      })
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [userId])
  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await task()
      await refresh()
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="detail-section engineer-credentials">
      <h3>Professional credentials & assignment eligibility</h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p>
          Credential information unavailable until the credential migration is
          installed and this view reloads.
        </p>
      ) : (
        <>
          <p>
            <strong>Account: {data.accountStatus}</strong> ·{" "}
            {data.eligibleForNewAssignment
              ? "Credential requirements satisfied"
              : "Not eligible for new assignments"}
          </p>
          <p>{data.eligibilityNote}</p>
          <p>
            Phase coordination matches:{" "}
            {data.qualifiedRequirements.join(", ") || "None"}. This does not
            authorize responsibility for every system in a phase.
          </p>
          {data.credentials.map((c) => (
            <article className="credential-record" key={c.id}>
              <div>
                <strong>
                  {c.profession ||
                    "Profession not recorded — Admin review required"}
                </strong>
                <p>
                  {c.license_number} · Expiry: {dateLabel(c.license_expiry)} ·{" "}
                  {c.expiryStatus}
                </p>
                <p>
                  {c.superseded_at
                    ? "Superseded"
                    : c.verification_status === "verified"
                      ? "Verified"
                      : "Needs review"}{" "}
                  ·{" "}
                  {c.eligible
                    ? "Outside license notice restriction"
                    : "Does not satisfy new-assignment credential requirements"}
                </p>
                {c.needsReview && (
                  <p>
                    Review the profession, number and supporting evidence;
                    existing data has not been automatically verified.
                  </p>
                )}
                {c.verified_at && (
                  <p>
                    Reviewed by {c.verified_by_name || "Recorded Administrator"}{" "}
                    on {new Date(c.verified_at).toLocaleString()}.{" "}
                    {c.verification_note}
                  </p>
                )}
                {admin && c.needsReview && !c.superseded_at && (
                  <Button
                    disabled={busy || !profession}
                    onClick={() =>
                      run(() =>
                        api(
                          "/licenses/credentials/" +
                            c.id +
                            "/submit-for-review",
                          { method: "POST", json: { profession } },
                        ),
                      )
                    }
                  >
                    Submit legacy evidence for selected profession
                  </Button>
                )}
              </div>
            </article>
          ))}
          {!data.credentials.length && (
            <p>No verified professional credentials on file.</p>
          )}
          <h4>Submit a credential or renewal</h4>
          <p>
            Each profession is submitted and verified separately. Submission
            does not restore eligibility.
          </p>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              const issue = licenseNumberError(number)
              if (issue) return setError(issue)
              if (!file) return setError("Choose a supporting document.")
              void run(async () => {
                await submitOwnRenewal({
                  profession,
                  licenseNumber: number,
                  licenseExpiry: expiry,
                  file,
                  userId: admin ? userId : undefined,
                })
                setNumber("")
                setExpiry("")
              })
            }}
          >
            <Field label="Licensed profession">
              <select
                required
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
              >
                <option value="">Select profession</option>
                {PROFESSIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="License number exactly as printed">
              <input
                required
                maxLength={120}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </Field>
            <Field label="Expiry date">
              <input
                required
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </Field>
            <Field label="Supporting credential document">
              <input
                required
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0])}
              />
            </Field>
            <p>
              Leading zeros are preserved. Format checking does not verify
              authenticity.
            </p>
            <Button disabled={busy} type="submit" variant="primary">
              Send for verification
            </Button>
          </form>
          <h4>Submission & review history</h4>
          {data.submissions.map((q) => (
            <article className="credential-record" key={q.id}>
              <div>
                <strong>
                  {q.profession || "Profession needs review"} ·{" "}
                  {q.status === "under_review"
                    ? "Pending verification"
                    : q.status === "rejected"
                      ? "Correction required"
                      : "Verified"}
                </strong>
                <p>
                  {q.license_number} · Expiry: {dateLabel(q.license_expiry)} ·
                  Submitted {dateLabel(q.submitted_at)}
                </p>
                {q.reviewed_at && (
                  <p>
                    Reviewed by {q.reviewed_by_name} on{" "}
                    {new Date(q.reviewed_at).toLocaleString()}. {q.review_note}
                  </p>
                )}
                <Button
                  onClick={() =>
                    openRenewalFile(q.id).catch((e) => setError(e.message))
                  }
                >
                  View submitted document
                </Button>
                {admin && q.status === "under_review" && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setReviewId(q.id)
                      setReviewProfession(q.profession || "")
                      setNote("")
                    }}
                  >
                    Review submission
                  </Button>
                )}
              </div>
            </article>
          ))}
          {admin && reviewId && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  await verifyRenewal(reviewId, {
                    profession: reviewProfession,
                    note,
                  })
                  setReviewId(undefined)
                })
              }}
            >
              <h4>Manual credential review</h4>
              <p>
                <a
                  href="https://verification.prc.gov.ph/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open official PRC verification website
                </a>{" "}
                · Manual check; no automatic integration.
              </p>
              <Field label="Confirmed licensed profession">
                <select
                  required
                  value={reviewProfession}
                  onChange={(e) => setReviewProfession(e.target.value)}
                >
                  <option value="">Select profession</option>
                  {PROFESSIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Verification result / correction reason">
                <textarea
                  required
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <p>Your identity and review time are recorded automatically.</p>
              <Button disabled={busy} type="submit" variant="primary">
                Verify credential
              </Button>
              <Button
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(async () => {
                    await rejectRenewal(reviewId, note)
                    setReviewId(undefined)
                  })
                }
              >
                Request correction
              </Button>
            </form>
          )}
          <h4>Recorded specializations</h4>
          <p>
            Separate from company trade capabilities. Recording these does not
            independently certify competence.
          </p>
          {data.specializations.map((s) => (
            <p key={s.specialization}>
              {s.specialization} · Recorded by {s.recorded_by_name} on{" "}
              {dateLabel(s.recorded_at)}
            </p>
          ))}
          {admin && (
            <>
              <div className="tag-list">
                {ENGINEER_SPECIALIZATIONS.map((tag) => (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={specializations.includes(tag)}
                      onChange={(e) =>
                        setSpecializations(
                          e.target.checked
                            ? [...specializations, tag]
                            : specializations.filter((t) => t !== tag),
                        )
                      }
                    />
                    {tag}
                    {!SPECIALIZATION_PROFESSIONS[tag]?.length
                      ? " (mapping pending company validation)"
                      : ""}
                  </label>
                ))}
              </div>
              <p>
                Maximum three specializations under the existing company limit.
              </p>
              <Button
                disabled={busy || specializations.length > 3}
                onClick={() =>
                  run(() =>
                    api(
                      "/licenses/credentials/" + userId + "/specializations",
                      { method: "PUT", json: { specializations } },
                    ),
                  )
                }
              >
                Save recorded specializations
              </Button>
            </>
          )}
        </>
      )}
    </section>
  )
}
