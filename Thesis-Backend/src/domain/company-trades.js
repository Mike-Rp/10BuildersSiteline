// Company services from trades offered.docx. Engineer qualifications use their
// own discipline catalog; company allocation must not inherit those requirements.
export const COMPANY_TRADES = Object.freeze([
  "Civil", "Structural", "Electrical", "Plumbing", "Mechanical",
  "Fire Protection", "Interior/Finishes", "Facade", "Waterproofing", "Landscape",
])

export const COMPANY_PHASE_TRADES = {
  Residential: {
    Mobilization: ["Civil", "Electrical", "Plumbing"],
    Design: ["Civil", "Structural", "Electrical"],
    Foundation: ["Civil", "Structural"],
    Structure: ["Structural", "Civil"],
    Envelope: ["Civil", "Facade", "Waterproofing"],
    "MEP Rough-In": ["Electrical", "Plumbing", "Mechanical"],
    Finishes: ["Interior/Finishes"],
    "Landscape & Site Works": ["Landscape", "Civil", "Plumbing"],
    Closeout: ["Civil", "Electrical", "Interior/Finishes"],
  },
  Commercial: {
    Mobilization: ["Civil", "Electrical", "Plumbing"],
    Design: ["Structural", "Mechanical", "Electrical"],
    Foundation: ["Civil", "Structural"],
    Structure: ["Structural", "Civil"],
    "Envelope / Curtain Wall": ["Facade", "Waterproofing"],
    "MEP Rough-In": ["Electrical", "Plumbing", "Mechanical", "Fire Protection"],
    "Fire & Life Safety": ["Fire Protection", "Electrical"],
    "Fit-Out / Finishes": ["Interior/Finishes", "Electrical"],
    Closeout: ["Electrical", "Mechanical", "Plumbing"],
  },
  "Mixed-Use": {
    Mobilization: ["Civil", "Electrical", "Plumbing"],
    Design: ["Structural", "Mechanical", "Electrical"],
    Foundation: ["Civil", "Structural"],
    "Podium Structure": ["Structural", "Civil"],
    "Tower Structure": ["Structural", "Civil"],
    "Envelope / Curtain Wall": ["Facade", "Waterproofing"],
    "MEP Rough-In": ["Electrical", "Plumbing", "Mechanical", "Fire Protection"],
    "Fire & Life Safety": ["Fire Protection", "Electrical"],
    "Retail/Commercial Fit-Out": ["Interior/Finishes", "Facade", "Electrical"],
    "Residential Fit-Out": ["Interior/Finishes", "Plumbing"],
    "Landscape & Site Works": ["Landscape", "Civil", "Plumbing"],
    Closeout: ["Electrical", "Mechanical", "Interior/Finishes"],
    "Hotel Fit-Out": ["Interior/Finishes", "Plumbing", "Mechanical"],
    Structure: ["Structural", "Civil"],
    Envelope: ["Civil", "Facade", "Waterproofing"],
    "Site Works": ["Civil", "Plumbing"],
    // The document omits this supported use. Apply the commercial fit-out trades.
    "Office Fit-Out": ["Interior/Finishes", "Electrical"],
  },
}

export function normalizeCompanyTrades(trades) {
  return [...new Set(trades.map(trade => trade === "Façade" ? "Facade" : trade))]
}

// Old recorded tags remain editable without making engineer-only disciplines
// selectable on new company registrations. Never infer verification from a tag.
export function companyTradeOptions(selected = []) {
  return [...new Set([...COMPANY_TRADES, ...selected])]
}

export function companyTradePhases(type, phases) {
  const definitions = COMPANY_PHASE_TRADES[type] || {}
  return phases.map(({ name }) => {
    let key = Object.keys(definitions).find(key => key.toLowerCase() === name.toLowerCase())
    if (!key && name === "Finishes") key = type === "Mixed-Use" ? "Retail/Commercial Fit-Out" : "Fit-Out / Finishes"
    // Unknown phases have no implied trade coverage and cannot be allocated.
    return { name, disciplines: [...(definitions[key] || [])] }
  })
}
