const day = 86400000;
export const MIN_PHASE_CALENDAR_DAYS = 14;
// Relative work-package weights for an illustrative early schedule. Six
// construction weights follow the measured low-rise residential process hours
// in https://7universum.com/en/tech/archive/item/22390 (Table 1): site
// preparation 120, foundation 150, framing 200, roofing 80, services 100,
// finishing 140. Design, fire safety, site works and closeout are explicit
// planning assumptions because that study does not measure those packages.
// These are proportions only, never absolute days or company benchmarks.
const phaseWeights = [120, 120, 150, 200, 80, 100, 100, 140, 80, 40];
const projectTypes = new Set(["Residential", "Commercial", "Mixed-Use"]);
const stageKinds = [
  /^Mobilization$/, /^Design$/, /^Foundation$/, /Structure/, /^Envelope/,
  /^MEP Rough/i, /^Fire & Life Safety$/, /Finishes|Fit-Out/i, /Landscape|Site Works/i, /^Closeout$/,
];

export function phaseWorkday(date, offset = 0) {
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return "";
  return new Date(time + offset * day).toISOString().slice(0, 10);
}

export function forecastPhaseDelay(dates, phase, release, rules = {}) {
  const original = dates[phase];
  if (!original || release <= original.start) return null;
  const revised = { ...dates };
  const ordered = Object.keys(dates).sort((a, b) => dates[a].start.localeCompare(dates[b].start));
  for (const name of ordered) {
    const range = dates[name];
    let start = name === phase ? release : range.start;
    const rule = rules[name];
    const predecessors = rule?.waitsFor ?? ordered.filter(before => dates[before].end < range.start);
    for (const before of predecessors) {
      if (!revised[before] || revised[before].end === dates[before].end) continue;
      const ready = phaseWorkday(revised[before].end, 1);
      if (ready > start) start = ready;
    }
    const overlap = rule?.overlapWith;
    if (overlap && revised[overlap]?.start !== dates[overlap]?.start) {
      const offset = Date.parse(revised[overlap].start) - Date.parse(dates[overlap].start);
      const ready = phaseWorkday(new Date(Date.parse(range.start) + offset).toISOString().slice(0, 10));
      if (ready > start) start = ready;
    }
    if (start === range.start) continue;
    let duration = 0;
    for (let cursor = range.start; cursor < range.end; cursor = phaseWorkday(cursor, 1)) duration++;
    revised[name] = { start, end: phaseWorkday(start, duration) };
  }
  return revised;
}

export function suggestPhaseSchedule({ phases, type, arrangement, start, end, dates = {} }) {
  if (!start || !projectTypes.has(type)) return {};
  const priority = phase => phase === "Mobilization" ? 0 : phase === "Design" ? 1 : 2;
  const order = [...phases].sort((a, b) => priority(a) - priority(b));
  const concurrent = arrangement === "Highly concurrent phases";
  const overlaps = concurrent || arrangement === "Partially overlapping phases";
  // Relative planning weights, not asserted construction durations.
  const weights = Object.fromEntries(order.map(phase => {
    const kind = stageKinds.findIndex(pattern => pattern.test(phase));
    return [phase, phaseWeights[kind] || 100];
  }));
  function build(scale, overrides) {
    const result = {};
    const daysByPhase = {};
    for (const [index, phase] of order.entries()) {
      const kind = stageKinds.findIndex(pattern => pattern.test(phase));
      const days = Math.max(MIN_PHASE_CALENDAR_DAYS, Math.ceil(weights[phase] * scale));
      const prior = order.slice(0, index);
      const structure = prior.findLast(name => /Structure/.test(name));
      const overlap = overlaps && structure && (kind === 4 || kind === 5 && concurrent);
      const waitsFor = overlap ? prior.slice(0, prior.indexOf(structure))
        : concurrent && kind === 7 ? prior.filter(name => !/Fit-Out/i.test(name)) : prior;
      const after = waitsFor.reduce((latest, name) => {
        const finish = overrides[name]?.end || result[name].end;
        return finish > latest ? finish : latest;
      }, "");
      let earliest = after ? phaseWorkday(after, 1) : phaseWorkday(start);
      if (overlap) {
        const range = overrides[structure]?.start && overrides[structure]?.end ? overrides[structure] : result[structure];
        const release = phaseWorkday(range.start, Math.floor(daysByPhase[structure] * (concurrent ? 0.5 : 2 / 3)));
        const milestone = release < range.end ? release : phaseWorkday(range.end, 1);
        if (milestone > earliest) earliest = milestone;
      }
      result[phase] = { start: earliest, end: phaseWorkday(earliest, days - 1), days, waitsFor,
        ...(overlap ? { overlapWith: structure } : {}) };
      daysByPhase[phase] = days;
    }
    return result;
  }
  if (!end || !Number.isFinite(Date.parse(end)) || end < start || !order.length) return build(1, dates);
  // Fit the phase allocation within the reviewed window. An impossible
  // window still shows the minimum schedule for the OPM to resolve.
  const windowDays = (Date.parse(end) - Date.parse(start)) / day + 1;
  let low = 0;
  let high = windowDays / Math.min(...Object.values(weights));
  for (let index = 0; index < 32; index++) {
    const middle = (low + high) / 2;
    const candidate = build(middle, {});
    const completion = Object.values(candidate).map(range => range.end).sort().at(-1);
    if (completion <= end) low = middle;
    else high = middle;
  }
  return build(low, dates);
}
