const mobilization = ["Construction Engineering", "Construction Surveying"];
const foundation = ["Foundation Engineering", "Structural Engineering", "Geotechnical Engineering"];
const structure = ["Structural Engineering", "Construction Engineering"];
const residentialDesign = ["Structural Engineering", "Electrical Design Engineering", "Plumbing Systems Engineering"];
const commercialDesign = [...residentialDesign, "Mechanical Building Services Engineering"];
const residentialRoughIn = ["Electrical Installation Engineering", "Plumbing Systems Engineering"];
const commercialRoughIn = [...residentialRoughIn, "Mechanical Building Services Engineering"];
const fireSafety = ["Fire Protection Engineering (Mechanical Systems)", "Fire Detection and Alarm Systems Engineering"];
const fitOut = ["Construction Engineering", "Lighting Engineering", "Electrical Installation Engineering"];
const residentialFitOut = ["Construction Engineering", ...residentialRoughIn];
const closeout = ["Construction Engineering"];

// Default scopes for new Office PM inquiry projects. Project-specific optional
// systems can be defined once intake captures whether each system is in scope.
const scopesByType = {
  Residential: {
    Mobilization: mobilization,
    Design: residentialDesign,
    Foundation: foundation,
    Structure: structure,
    Envelope: structure,
    "MEP Rough-In": residentialRoughIn,
    Finishes: closeout,
    "Landscape & Site Works": mobilization,
    Closeout: closeout,
  },
  Commercial: {
    Mobilization: mobilization,
    Design: commercialDesign,
    Foundation: foundation,
    Structure: structure,
    "Envelope / Curtain Wall": structure,
    "MEP Rough-In": commercialRoughIn,
    "Fire & Life Safety": fireSafety,
    "Fit-Out / Finishes": fitOut,
    Closeout: closeout,
  },
  "Mixed-Use": {
    Mobilization: mobilization,
    Design: commercialDesign,
    Foundation: foundation,
    "Podium Structure": structure,
    "Tower Structure": structure,
    "Envelope / Curtain Wall": structure,
    "MEP Rough-In": commercialRoughIn,
    "Fire & Life Safety": fireSafety,
    "Retail/Commercial Fit-Out": fitOut,
    "Residential Fit-Out": residentialFitOut,
    "Landscape & Site Works": mobilization,
    Closeout: closeout,
  },
};

export function inquiryEngineerScopes(type, phases) {
  return Object.fromEntries(phases.flatMap(phase => {
    const scopes = scopesByType[type]?.[phase];
    return scopes ? [[phase, [...scopes]]] : [];
  }));
}
