// Normalizes the demo and bulk-test projects that still use the old Infrastructure,
// Industrial and Renovation types so every project is Residential, Commercial or Mixed-Use.
//
// Safety rules:
//  - only projects.project_type_id and projects.name are ever changed;
//  - a project is touched only when its id, current name AND current type all match
//    what this plan expects, so user-created or already-edited projects are skipped;
//  - nothing is deleted; documents, history, teams, checklists and progress are untouched;
//  - safe to run again: projects already updated are reported and skipped;
//  - nothing is written unless { apply: true } is passed.
import { createHash } from "node:crypto";

const PLACES = ["Cedar Heights", "Harbor Point", "Maple Grove", "Riverstone", "Summit Park",
    "Orchard Place", "Lakeside", "Northgate", "Palm Crest", "Westhaven"];
// Order of project_types ids 1..6 in the schema.
const BULK_OLD_TYPES = ["Residential", "Commercial", "Mixed-Use", "Infrastructure", "Industrial", "Renovation"];
export const LEGACY_TYPES = ["Infrastructure", "Industrial", "Renovation"];
export const INTAKE_TYPES = ["Residential", "Commercial", "Mixed-Use"];

// Must match _bulk_type_map in supabase/seed/bulk-test-data.sql.
export function bulkNewType(n) {
    switch ((n - 1) % 6) {
        case 0: return "Residential";
        case 1: return "Commercial";
        case 2: return "Mixed-Use";
        case 3: return Math.floor((n - 4) / 6) % 2 === 0 ? "Commercial" : "Residential";
        case 4: return "Commercial";
        default: return "Residential";
    }
}
const bulkId = (n) => {
    const h = createHash("md5").update("siteline-bulk-v1/project/" + n).digest("hex");
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
};
const pad = (n) => String(n).padStart(3, "0");

const DEMO_PLAN = [
    { id: "d60fa456-6d28-418c-8a09-47858c1d94b0", name: "Brookfield Warehouse Ext.", from: "Industrial", to: "Commercial", newName: "Brookfield Warehouse Ext." },
    { id: "a65d41ad-d8da-4f46-8899-3420cd643808", name: "Cavite Cold Storage Facility", from: "Industrial", to: "Commercial", newName: "Cavite Cold Storage Facility" },
    { id: "502293ef-a9c6-4c06-89ff-7e490519b3c1", name: "Meralco Ave. Fit-out", from: "Renovation", to: "Commercial", newName: "Meralco Ave. Fit-out" },
    { id: "f5ab4493-4c0e-47c6-8bb7-3f6ea4cc0fd5", name: "Sto. Niño Bridge Widening", from: "Infrastructure", to: "Residential", newName: "Sto. Niño Townhomes — Phase 2" },
];

/** Every project this migration may change: { id, name, from, to, newName }. */
export function buildPlan() {
    const bulk = [];
    for (let n = 1; n <= 50; n++) {
        const from = BULK_OLD_TYPES[(n - 1) % 6];
        if (!LEGACY_TYPES.includes(from)) continue;
        const place = PLACES[(n - 1) % 10];
        const to = bulkNewType(n);
        bulk.push({ id: bulkId(n), name: `${place} ${from} ${pad(n)}`, from, to, newName: `${place} ${to} ${pad(n)}` });
    }
    return [...DEMO_PLAN, ...bulk];
}

/**
 * Compares the plan with the database and, when apply is true, updates the matching rows.
 * `db` is any object with query(sql, params) (a pg client inside a transaction, or PGlite).
 */
export async function normalizeProjectTypes(db, { apply = false, plan = buildPlan() } = {}) {
    const types = Object.fromEntries((await db.query("select id, code from project_types")).rows.map((r) => [r.code, r.id]));
    for (const item of plan)
        if (!types[item.to] || !INTAKE_TYPES.includes(item.to)) throw new Error("Unknown target type " + item.to);
    const report = [];
    for (const item of plan) {
        const row = (await db.query(
            "select p.name, t.code as type from projects p join project_types t on t.id = p.project_type_id where p.id = $1",
            [item.id])).rows[0];
        let status;
        if (!row) status = "not present";
        else if (row.name === item.newName && row.type === item.to) status = "already updated";
        else if (row.name === item.name && row.type === item.from) {
            if (!apply) status = "will change";
            else {
                const changed = await db.query(
                    `update projects set project_type_id = $2, name = $3
                      where id = $1 and name = $4 and project_type_id = $5 returning id`,
                    [item.id, types[item.to], item.newName, item.name, types[item.from]]);
                status = changed.rows.length === 1 ? "changed" : "differs (not touched)";
            }
        }
        else status = "differs (not touched)";
        report.push({ ...item, current: row ? `${row.name} / ${row.type}` : "", status });
    }
    return report;
}
