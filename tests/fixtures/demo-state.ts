// Test fixtures only. The running application never imports these records.
import {
  PHASES,
  projectDocs,
  uid,
  type Account,
  type Role,
  type Project,
  type Company,
  type State,
} from "../../src/model.ts"

const SEED_PHONES: Record<string, string> = {
  a1: "0917 331 4420",
  a2: "0917 482 1036",
  a3: "0918 225 7741",
  a4: "0917 609 3352",
  a5: "0919 714 2268",
  a6: "0918 390 5517",
  a7: "0917 856 0943",
  a8: "0919 263 8105",
  a9: "0917 540 6629",
}
function account(
  id: string,
  name: string,
  role: Role,
  scope: string[] = [],
  types: string[] = [],
): Account {
  return {
    id,
    name,
    role,
    scope,
    projectTypes: types,
    email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ").at(-1)?.toLowerCase()}@10builders.com`,
    phone: SEED_PHONES[id] || "0917 331 4420",
    status: "active",
    added: "2026-02-14",
    license:
      role === "opm" || role === "spm"
        ? `PRC Registered Engineer No. 00${id.replace(/\D/g, "")}1234`
        : "",
    expiry: role === "opm" || role === "spm" ? "2027-08-18" : "",
    docs: [],
  }
}
export function initialState(): State {
  const accounts = [
    account("a1", "Patricia N. Domingo", "admin"),
    account("a2", "Renz D. Villaverde", "opm", [], [
      "Residential",
      "Mixed-Use",
    ]),
    account("a3", "Lea M. Fernandez", "opm", [], ["Commercial", "Mixed-Use"]),
    account("a4", "Karlo M. Espiritu", "spm", [
      "Structural",
      "Civil",
      "Landscape",
    ]),
    account("a5", "Rafael D. Mercado", "spm", [
      "Mechanical",
      "Electrical",
      "Plumbing",
    ]),
    account("a6", "Mikaela Bautista", "spm", [
      "Civil",
      "Geotechnical",
      "Structural",
    ]),
    account("a7", "Diego A. Salvador", "spm", [
      "Structural",
      "Fire Protection",
      "Acoustic",
    ]),
    account("a8", "Bea R. Concepcion", "spm", [
      "Civil",
      "Electrical",
      "Interior/Finishes",
    ]),
    account("a9", "Ferdinand Uy", "client", ["p1", "p4"]),
  ]
  accounts[8].email = "f.uy@aldenheights-hoa.com"
  accounts[7].expiry = new Date(Date.now() + 35 * 86400000)
    .toISOString()
    .slice(0, 10)
  accounts.push({
    ...account("a10", "Jomar T. Reyes", "spm", ["Civil"]),
    status: "suspended",
    suspendedAt: new Date(Date.now() - 87 * 86400000)
      .toISOString()
      .slice(0, 10),
  })
  const seedProject = (
    id: string,
    name: string,
    type: string,
    phase: string,
    progress: number,
    opmId: string,
    spmId: string,
    status: Project["status"] = "active",
  ): Project => ({
    id,
    name,
    type,
    phase,
    progress,
    opmId,
    clientId: "a9",
    area: "9,120",
    floors: "6",
    start: "2026-03-10",
    end: "2027-04-30",
    location: "Metro Manila, Philippines",
    status,
    opmAccepted: status === "active" || status === "completed",
    team: PHASES.map((p) => ({
      phase: p,
      accountId: spmId,
      status:
        status === "active" || status === "completed" ? "confirmed" : "pending",
    })),
    docs: projectDocs(status === "active" || status === "completed"),
    created: "2026-07-20",
    note: "",
    excludedOpms: [],
    history: [
      {
        date: "2026-07-28",
        text: "Latest site progress reviewed by Office PM.",
        progress,
      },
    ],
  })
  const projects = [
    seedProject(
      "p1",
      "Rosaria Business Park",
      "Commercial",
      "Structure",
      62,
      "a2",
      "a6",
    ),
    seedProject(
      "p2",
      "Meralco Ave. Fit-out",
      "Renovation",
      "Finishes",
      91,
      "a3",
      "a8",
    ),
    seedProject(
      "p3",
      "Brookfield Warehouse Ext.",
      "Commercial",
      "Design",
      12,
      "a3",
      "a7",
    ),
    seedProject(
      "p4",
      "Alden Heights Residences — Tower B",
      "Residential",
      "Mobilization",
      0,
      "a2",
      "a4",
      "pending",
    ),
    seedProject(
      "p5",
      "Sto. Niño Bridge Widening",
      "Infrastructure",
      "Mobilization",
      0,
      "a2",
      "a7",
      "changes_requested",
    ),
    seedProject(
      "p6",
      "Cavite Cold Storage Facility",
      "Industrial",
      "Closeout",
      100,
      "a2",
      "a7",
      "completed",
    ),
    seedProject(
      "p7",
      "Biñan Elevated Walkway",
      "Infrastructure",
      "Mobilization",
      0,
      "a3",
      "a6",
      "declined",
    ),
  ]
  projects[3].area = "18,400"
  projects[3].floors = "22"
  projects[3].start = "2026-09-01"
  projects[3].end = "2027-12-31"
  projects[3].team = PHASES.map((phase, i) => ({
    phase,
    accountId: i === 0 ? "a4" : "a5",
    status: "pending",
  }))
  projects[4].note =
    "Office PM requested revised staffing. Select a replacement Office PM to resubmit."
  projects[4].excludedOpms = ["a2"]
  const companies: Company[] = [
    {
      id: "c1",
      name: "Meridian Rebar & Formworks",
      contact: "Ramil D. Escueta",
      phone: "0917-224-5510",
      email: "projects@meridianrebar.ph",
      status: "approved",
      submittedBy: "Karlo M. Espiritu",
      projectId: "p1",
      availability: "available",
      manpowerCount: 3,
      activeProjectIds: ["p1"],
      manpowerDocuments: [],
      documents: [],
      note: "",
      version: 1,
    },
    {
      id: "c2",
      name: "Cordova Electrical Systems",
      contact: "Alexis M. Cordova",
      phone: "0917-555-2091",
      email: "info@cordovaelectrical.ph",
      status: "approved",
      submittedBy: "",
      projectId: "p2",
      availability: "committed",
      manpowerCount: 2,
      activeProjectIds: ["p1", "p2"],
      manpowerDocuments: [],
      documents: [],
      note: "",
      version: 1,
    },
    {
      id: "c3",
      name: "Isla Glass & Curtain Wall",
      contact: "Peter John Isla",
      phone: "0917-660-2214",
      email: "contact@islaglass.ph",
      status: "approved",
      submittedBy: "",
      projectId: "",
      availability: "available",
      manpowerCount: 1,
      activeProjectIds: [],
      manpowerDocuments: [],
      documents: [],
      note: "",
      version: 1,
    },
    {
      id: "c4",
      name: "Tagaytay Steel Works",
      contact: "Manuel D. Santos",
      phone: "0918-440-3312",
      email: "office@tagaytaysteel.ph",
      status: "pending",
      submittedBy: "Karlo M. Espiritu",
      projectId: "p4",
      availability: "limited",
      manpowerCount: 1,
      activeProjectIds: [],
      manpowerDocuments: [],
      documents: [],
      note: "New company submitted from the site. Supporting documents not yet on file.",
      version: 1,
    },
    {
      id: "c5",
      name: "Del Pilar Fire Protection",
      contact: "Arnold P. Del Pilar",
      phone: "0918-556-9012",
      email: "inquiries@delpilarfire.ph",
      status: "pending",
      submittedBy: "Rafael D. Mercado",
      projectId: "p3",
      availability: "limited",
      manpowerCount: 1,
      activeProjectIds: [],
      manpowerDocuments: [],
      documents: [],
      note: "Company registration awaiting administrative review.",
      version: 1,
    },
  ]
  return {
    accounts,
    projects,
    companies,
    rules: { grace: 7, cap: 2, response: 3, idle: 15 },
    muted: [],
    events: [
      {
        id: uid(),
        title: "New subcontractor awaiting approval",
        detail: "Tagaytay Steel Works · submitted by Karlo M. Espiritu",
        type: "request",
        date: new Date().toISOString(),
        read: false,
        target: "Approvals",
      },
      {
        id: uid(),
        title: "Project documents updated",
        detail: "Rosaria Business Park · Office PM registered documents",
        type: "progress",
        date: new Date(Date.now() - 3600000).toISOString(),
        read: false,
        target: "Project documents",
      },
      {
        id: uid(),
        title: "Project intake sent for confirmation",
        detail: "Alden Heights Residences — Tower B · Renz D. Villaverde",
        type: "request",
        date: new Date(Date.now() - 7200000).toISOString(),
        read: true,
        target: "Project intake",
      },
      {
        id: uid(),
        title: "Site progress reviewed",
        detail: "Meralco Ave. Fit-out · Finishes at 91%",
        type: "approval",
        date: new Date(Date.now() - 10800000).toISOString(),
        read: true,
        target: "Active sites",
      },
    ],
  }
}
