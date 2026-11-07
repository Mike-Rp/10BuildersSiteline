import { useId, useState } from "react"
import { EXPERIENCE_PROJECT_TYPES, experienceMonths, type EngineerExperience } from "../Thesis-Backend/src/domain/engineer-experience.js"
import "./project-experience-fields.css"

export default function ProjectExperienceFields({ value, onChange }: { value?: EngineerExperience; onChange: (value: EngineerExperience) => void }) {
  const prefix = useId()
  const [parts, setParts] = useState(() => Object.fromEntries(EXPERIENCE_PROJECT_TYPES.map(type => {
    const recorded = Object.prototype.hasOwnProperty.call(value || {}, type), total = experienceMonths(value, type)
    return [type, { years: recorded ? String(Math.floor(total / 12)) : "", months: recorded ? String(total % 12) : "" }]
  })))
  function valid(years: string, months: string) {
    return (!years || /^\d+$/.test(years)) && (!months || /^\d+$/.test(months)) && Number(years) <= 80 && Number(months) <= 11 && Number(years) * 12 + Number(months) <= 960
  }
  function update(type: string, unit: "years" | "months", text: string) {
    const next = { ...parts, [type]: { ...parts[type], [unit]: text } }
    setParts(next)
    const experience: EngineerExperience = {}
    for (const projectType of EXPERIENCE_PROJECT_TYPES) {
      const { years, months } = next[projectType]
      if (years !== "" || months !== "") experience[projectType] = { months: valid(years, months) ? Number(years) * 12 + Number(months) : NaN }
    }
    onChange(experience)
  }
  return <section className="form-section project-experience-fields">
    <h3>Project experience</h3>
    <p id={`${prefix}-help`}>Use 0 years and 0 months for no experience. Leave both blank if not recorded.</p>
    {EXPERIENCE_PROJECT_TYPES.map((type, index) => {
      const row = parts[type], invalid = !valid(row.years, row.months)
      return <div className="experience-duration-row" key={type}>
        <h4>{type}</h4>
        {(["years", "months"] as const).map(unit => <div className="experience-duration-field" key={unit}>
          <label htmlFor={`${prefix}-${index}-${unit}`}>{unit === "years" ? "Years" : "Months"}</label>
          <input id={`${prefix}-${index}-${unit}`} aria-label={`${type} experience (${unit})`} aria-describedby={`${prefix}-help${invalid ? ` ${prefix}-${index}-error` : ""}`} aria-invalid={invalid} type="number" inputMode="numeric" min={0} max={unit === "years" ? 80 : 11} step={1} value={row[unit]} placeholder="—" onChange={event => update(type, unit, event.target.value)} />
        </div>)}
        {invalid && <small className="error experience-duration-error" id={`${prefix}-${index}-error`} role="alert">Use whole years (0–80) and months (0–11), up to 80 years total.</small>}
      </div>
    })}
  </section>
}
