import { useState } from "react"

type Lineup = {stage: string; user_id: string | null; engineers?: {user_id: string}[]}

export default function StaffingPeak({phases, team, arrangement}: {
  phases: string[]; team: Lineup[]; arrangement?: string
}) {
  const [groups,setGroups] = useState<string[][]>([[]])
  const partial = arrangement === "Partially overlapping phases"
  const concurrent = arrangement === "Highly concurrent phases"
  const windows = phases.map(phase => [phase])
  if (concurrent) windows.push(phases)
  if (partial) windows.push(...groups.map(group => group.filter(p => phases.includes(p))))
  const people = (phase: string) => {
    const row = team.find(entry => entry.stage === phase)
    return row?.engineers?.map(engineer => engineer.user_id) ?? (row?.user_id ? [row.user_id] : [])
  }
  const demand = windows.map(group => group.flatMap(people))
  const peak = Math.max(0,...demand.map(ids => ids.length))
  const conflict = demand.some(ids => ids.length !== new Set(ids).size)
  const incomplete = phases.some(phase => !people(phase).length)
  return <section className="inquiry-card">
    <h3>Peak staffing</h3>
    {partial && <>
      <p>Select phases that run at the same time. Add a group for each different overlap.</p>
      {groups.map((group,index) => <fieldset key={index}><legend>Overlap group {index+1}</legend>
        {phases.map(phase => <label className="inquiry-check" key={phase}><input type="checkbox" checked={group.includes(phase)}
          onChange={() => setGroups(previous => previous.map((members,i) => i !== index ? members :
            members.includes(phase) ? members.filter(p => p !== phase) : [...members,phase]))}/>{phase}</label>)}
        {groups.length > 1 && <button type="button" className="button" onClick={() => setGroups(previous => previous.filter((_,i)=>i!==index))}>Remove group</button>}
      </fieldset>)}
      <button type="button" className="button" onClick={() => setGroups(previous => [...previous,[]])}>Add overlap group</button>
    </>}
    <p>{concurrent ? "Assuming all selected phases overlap." : partial ? "Based on the selected overlap groups." : "Phases run sequentially."}</p>
    <strong>{peak} Site PM{peak===1?"":"s"} needed at the same time</strong>
    {incomplete && <p>Unfilled phases are excluded from this estimate.</p>}
    {conflict && <p role="status">An engineer is assigned to simultaneous phases. Each simultaneous assignment needs a separate available engineer.</p>}
  </section>
}
