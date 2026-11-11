import { useState } from "react"
import type { Project, State } from "./model"
import { spmCandidates } from "./model"
import { Button, Modal } from "./ui"
import "./phase-engineers.css"
import {
  allocatePhaseCoverage,
} from "../Thesis-Backend/src/domain/engineer-phase-coverage.js"

import { phaseCoverageQuota } from "./phase-coverage-policy"

type Row = Project["team"][number]
export function recommendPhaseEngineers(
  state: State,
  type: string,
  phase: string,
  tags: string[],
  projectId: string,
) {
  const candidates = spmCandidates(state, type, phase, projectId, tags)
  return allocatePhaseCoverage(
    tags,
    candidates.map((c) => ({
      id: c.account.id,
      qualifiedTags: c.availableTags,
    })),
  ).engineers.map((e) => ({
    accountId: e.id,
    assignedDisciplines: e.tags,
    status: "pending" as const,
  }))
}
export function phaseCoverageMissing(row: Row, tags: string[]) {
  return tags.filter(
    (tag) => !row.engineers?.some((e) => e.assignedDisciplines.includes(tag)),
  )
}
export function phaseCoverageMeetsQuota(row: Row, tags: string[]) {
  const covered = tags.length - phaseCoverageMissing(row, tags).length
  return (
    covered >= phaseCoverageQuota(tags) &&
    (row.engineers?.length || 0) <= 3
  )
}
export default function PhaseEngineerAllocation({
  state,
  type,
  row,
  required,
  projectId,
  team,
  onChange,
}: {
  state: State
  type: string
  row: Row
  required: string[]
  projectId: string
  team: Row[]
  onChange: (row: Row) => void
}) {
  const engineers = row.engineers || [],
    candidates = spmCandidates(state, type, row.phase, projectId, required)
  const missing = phaseCoverageMissing(row, required)
  const [picker, setPicker] = useState<{
    index: number
    selected: string
    search: string
  }>()
  const limitReached = engineers.length >= 3
  function update(list: NonNullable<Row["engineers"]>) {
    onChange({
      ...row,
      engineers: list,
      accountId: list[0]?.accountId || "",
      assignedDisciplines: list[0]?.assignedDisciplines,
    })
  }
  // Exclude only the row being replaced: its responsibilities can be reassigned,
  // while all other engineers and their responsibilities remain intact.
  function options(index: number) {
    const others = engineers.filter((_, i) => i !== index)
    const gaps = required.filter(
      (tag) => !others.some((e) => e.assignedDisciplines.includes(tag)),
    )
    return candidates
      .filter((c) => !others.some((e) => e.accountId === c.account.id))
      .map((c) => ({
        ...c,
        gaps: c.availableTags.filter((tag) => gaps.includes(tag)).slice(0, 3),
      }))
      .sort((a, b) => b.gaps.length - a.gaps.length)
  }
  function openPicker(index: number) {
    const best = options(index).find((c) => c.gaps.length)
    setPicker({ index, selected: best?.account.id || "", search: "" })
  }
  const choices = picker ? options(picker.index) : []
  const best = choices.find((c) => c.gaps.length)
  const selected = choices.find((c) => c.account.id === picker?.selected)
  const pickerGaps = picker
    ? required.filter(
        (tag) =>
          !engineers.some(
            (e, i) => i !== picker.index && e.assignedDisciplines.includes(tag),
          ),
      )
    : []
  function assign(id: string) {
    if (!picker || (picker.index >= engineers.length && limitReached)) return
    const choice = choices.find((c) => c.account.id === id)
    if (!choice || !choice.gaps.length) return
    const next = {
      accountId: id,
      assignedDisciplines: choice.gaps,
      status: "pending" as const,
    }
    update(
      picker.index < engineers.length
        ? engineers.map((e, i) => (i === picker.index ? next : e))
        : [...engineers, next],
    )
    setPicker(undefined)
  }
  const quota = phaseCoverageQuota(required),
    quotaMet = phaseCoverageMeetsQuota(row, required)
  return (
    <section className="phase-engineer-allocation">
      <div className="phase-engineer-heading">
        <strong>{row.phase}</strong>
        <span className={quotaMet ? "coverage-ready" : "coverage-missing"}>
          {required.length - missing.length} of {required.length} areas covered
          {` · minimum ${quota} (50%)`}
        </span>
      </div>
      <div className="tag-list">
        {required.map((tag) => (
          <span
            key={tag}
            className={missing.includes(tag) ? "" : "engineer-covered"}
          >
            {tag}
          </span>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="engineer-gaps">
          Still needed: <strong>{missing.join(", ")}</strong>
        </p>
      )}
      <div className="phase-engineer-grid">
        {engineers.map((engineer, index) => {
          const account = state.accounts.find(
            (a) => a.id === engineer.accountId,
          )
          const allowed =
            candidates.find((c) => c.account.id === engineer.accountId)
              ?.availableTags || []
          const succeeding = team
            .slice(team.findIndex((t) => t.phase === row.phase) + 1)
            .filter((t) =>
              t.engineers?.some((e) => e.accountId === engineer.accountId),
            )
          return (
            <article key={index}>
              <span>Assigned Site PM</span>
              <Button
                className="engineer-picker-trigger"
                aria-label={`Change ${row.phase} engineer ${index + 1}`}
                aria-haspopup="dialog"
                onClick={() => openPicker(index)}
              >
                {account?.name || "Choose an eligible engineer"}{" "}
                <span aria-hidden="true">⌄</span>
              </Button>
              <small>
                Site PM
                {account?.professionalTypes?.length
                  ? ` · ${account.professionalTypes.join(" · ")}`
                  : ""}
              </small>
              <div className="tag-list" aria-label="Qualified phase tags">
                {allowed.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <fieldset>
                <legend>Responsibilities in {row.phase}</legend>
                {required.map((tag) => {
                  const taken = engineers.some(
                    (e, i) =>
                      i !== index && e.assignedDisciplines.includes(tag),
                  )
                  const checked = engineer.assignedDisciplines.includes(tag)
                  const reason = !allowed.includes(tag)
                    ? "No eligible qualification for this area"
                    : taken
                      ? "Assigned to another engineer"
                      : !checked && engineer.assignedDisciplines.length >= 3
                        ? "Maximum three responsibilities per engineer"
                        : undefined
                  return (
                    <label key={tag} title={reason}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!!reason}
                        aria-label={`${tag}${reason ? ` — ${reason}` : ""}`}
                        onChange={() =>
                          update(
                            engineers.map((e, i) =>
                              i === index
                                ? {
                                    ...e,
                                    assignedDisciplines: checked
                                      ? e.assignedDisciplines.filter(
                                          (t) => t !== tag,
                                        )
                                      : [...e.assignedDisciplines, tag],
                                  }
                                : e,
                            ),
                          )
                        }
                      />
                      {tag}
                      {reason && (
                        <span className="engineer-reason">{reason}</span>
                      )}
                    </label>
                  )
                })}
              </fieldset>
              {succeeding.length > 0 && (
                <p>
                  Also assigned to succeeding phases:{" "}
                  {succeeding.map((t) => t.phase).join(", ")}
                </p>
              )}
              <small>
                Eligible for this project ·{" "}
                {account?.name || "No engineer selected"}
              </small>
              <Button
                onClick={() => update(engineers.filter((_, i) => i !== index))}
              >
                Remove engineer
              </Button>
            </article>
          )
        })}
      </div>
      <Button
        disabled={limitReached || !missing.length}
        onClick={() => openPicker(engineers.length)}
      >
        Add engineer
      </Button>
      {limitReached && missing.length > 0 && (
        <p role="status">
          Three-engineer limit reached. Use an engineer's name button to review
          replacements for the remaining areas.
        </p>
      )}
      {missing.length > 0 && (
        <p role="status">
          {quotaMet
            ? `Minimum coverage quota met. Still uncovered: ${missing.join(", ")}.`
            : `Uncovered areas: ${missing.join(", ")}. Cover at least ${quota} required areas (50%, rounded up).`}
        </p>
      )}
      <p className="role-muted">
        Aim for full coverage whenever eligible engineers are available. Each
        engineer can cover up to three areas. For every phase, the
        minimum quota is half the areas, with at most three engineers. Engineers
        may cover succeeding phases within this project; existing project
        commitments and eligibility checks still apply.
      </p>
      {picker && (
        <Modal
          title={`Choose an engineer · ${row.phase}`}
          subtitle="Review qualifications and select an engineer to fill the remaining areas."
          wide
          onClose={() => setPicker(undefined)}
        >
          <div className="engineer-choice-panel">
            <p>
              Still needed:{" "}
              <strong>{pickerGaps.join(", ") || "All areas covered"}</strong>
            </p>
            <label className="engineer-search">
              Search name or specialization
              <input
                autoFocus
                type="search"
                value={picker.search}
                onChange={(e) =>
                  setPicker({ ...picker, search: e.target.value })
                }
                placeholder="Search name or specialization"
              />
            </label>
            <p className="role-muted">
              Ranked by uncovered areas they can cover · up to three
              responsibilities per engineer
            </p>
            {!best && (
              <p role="status" className="engineer-no-match">
                No available eligible engineer matches the remaining areas:{" "}
                {pickerGaps.join(", ") || "none"}. Existing assignments have
                been preserved.
              </p>
            )}
            <div
              className="engineer-choice-list"
              role="group"
              aria-label="Eligible engineers"
            >
              {choices
                .filter((c) =>
                  `${c.account.name} ${c.account.professionalTypes?.join(" ") || ""} ${c.availableTags.join(" ")}`
                    .toLowerCase()
                    .includes(picker.search.trim().toLowerCase()),
                )
                .map((c) => (
                  <Button
                    key={c.account.id}
                    className={`engineer-choice ${
                      picker.selected === c.account.id
                        ? "engineer-choice-selected"
                        : ""
                    }`}
                    aria-pressed={picker.selected === c.account.id}
                    onClick={() =>
                      setPicker({ ...picker, selected: c.account.id })
                    }
                  >
                    <span className="engineer-choice-person">
                      <strong>{c.account.name}</strong>
                      <span>
                        Site PM
                        {c.account.professionalTypes?.length
                          ? ` · ${c.account.professionalTypes.join(" · ")}`
                          : ""}
                      </span>
                      <span>Eligible for this project</span>
                    </span>
                    <span className="engineer-choice-tags">
                      <span>Qualified phase tags</span>
                      <span className="tag-list">
                        {c.availableTags.map((tag) => (
                          <span
                            key={tag}
                            className={
                              c.gaps.includes(tag) ? "engineer-gap-tag" : ""
                            }
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span
                      className={
                        c.gaps.length ? "coverage-ready" : "engineer-zero-match"
                      }
                    >
                      {c.gaps.length
                        ? `${
                            c === best ? "Best match · " : ""
                          }Fills ${c.gaps.length} ${
                            c.gaps.length === 1 ? "gap" : "gaps"
                          }`
                        : "Already covered · fills 0 gaps"}
                    </span>
                  </Button>
                ))}
              {choices.length > 0 &&
                !choices.some((c) =>
                  `${c.account.name} ${c.account.professionalTypes?.join(" ") || ""} ${c.availableTags.join(" ")}`
                    .toLowerCase()
                    .includes(picker.search.trim().toLowerCase()),
                ) && <p role="status">No engineers match your search.</p>}
            </div>
            <p className="role-muted">
              Green tags fill gaps. Other tags are already covered or exceed the
              three-area limit.
            </p>
            {selected && (
              <div className="engineer-choice-preview" role="status">
                {selected.gaps.length ? (
                  <>
                    Selecting {selected.account.name} would cover{" "}
                    <strong>{selected.gaps.join(", ")}</strong>. Projected
                    coverage:{" "}
                    <strong>
                      {required.length -
                        pickerGaps.length +
                        selected.gaps.length}{" "}
                      of {required.length}
                    </strong>
                    .
                  </>
                ) : (
                  `${selected.account.name} cannot fill any remaining areas with the current assignments.`
                )}
              </div>
            )}
            <div className="modal-actions">
              <Button
                variant="primary"
                disabled={!best}
                onClick={() => best && assign(best.account.id)}
              >
                Use best match
              </Button>
              <Button
                disabled={!selected?.gaps.length}
                onClick={() => selected && assign(selected.account.id)}
              >
                Use selected engineer
              </Button>
              <Button onClick={() => setPicker(undefined)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
