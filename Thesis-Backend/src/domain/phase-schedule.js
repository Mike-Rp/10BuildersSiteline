const day = 86400000;
const profiles = {
  Residential: [5,20,20,30,15,15,0,20,8,5],
  Commercial: [7,30,30,45,30,30,15,30,0,10],
  "Mixed-Use": [10,40,40,60,40,40,20,30,15,12],
};
const stageKinds = [
  /^Mobilization$/, /^Design$/, /^Foundation$/, /Structure/, /^Envelope/,
  /^MEP Rough/i, /^Fire & Life Safety$/, /Finishes|Fit-Out/i, /Landscape|Site Works/i, /^Closeout$/,
];
const complexityFactors = { Low: 0.85, Moderate: 1, High: 1.3 };

export function phaseWorkday(date, offset = 0) {
  let time = Date.parse(date);
  if (!Number.isFinite(time)) return "";
  const direction = offset < 0 ? -1 : 1;
  const weekend = () => [0, 6].includes(new Date(time).getUTCDay());
  while (weekend()) time += direction * day;
  for (let remaining = Math.abs(offset); remaining; remaining--) {
    do { time += direction * day; } while (weekend());
  }
  return new Date(time).toISOString().slice(0, 10);
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

export function suggestPhaseSchedule({ phases, type, complexity, arrangement, start, area, dates = {} }) {
  if (!start || !profiles[type]) return {};
  const profile = profiles[type];
  const order = [...phases].sort((a, b) => Number(b === "Design") - Number(a === "Design"));
  const result = {};
  const daysByPhase = {};
  const concurrent = arrangement === "Highly concurrent phases";
  const overlaps = concurrent || arrangement === "Partially overlapping phases";
  for (const [index, phase] of order.entries()) {
    const kind = stageKinds.findIndex(pattern => pattern.test(phase));
    const baseline = phase === "Podium Structure" ? 30 : phase === "Residential Fit-Out" ? 25 : profile[kind] || 10;
    const days = Math.ceil(baseline * (complexityFactors[complexity] ?? 1) * Math.sqrt(Math.max(1, Number(area) || 200) / 200));
    const prior = order.slice(0, index);
    const structure = prior.findLast(name => /Structure/.test(name));
    const overlap = overlaps && structure && (kind === 4 || kind === 5 && concurrent);
    const waitsFor = overlap ? prior.slice(0, prior.indexOf(structure))
      : concurrent && kind === 7 ? prior.filter(name => !/Fit-Out/i.test(name)) : prior;
    const after = waitsFor.reduce((latest, name) => {
      const end = dates[name]?.end || result[name].end;
      return end > latest ? end : latest;
    }, "");
    let earliest = after ? phaseWorkday(after, 1) : phaseWorkday(start);
    if (overlap) {
      const range = dates[structure]?.start && dates[structure]?.end ? dates[structure] : result[structure];
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
