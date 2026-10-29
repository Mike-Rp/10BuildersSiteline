// Only global phase/discipline definitions are cached. Never pass accounts,
// project records, permissions, rules, notifications or file bytes to this cache.
async function readReferences(db) {
  const references = (await db.query(`select pt.code as type,s.code as name,w.sort_order,
    coalesce(array_agg(distinct d.code) filter(where d.code is not null),'{}') as disciplines
    from project_types pt join project_type_stages w on w.project_type_id=pt.id
    join project_stages s on s.id=w.project_stage_id
    left join project_stage_discipline_links l on l.project_type_id=pt.id and l.project_stage_id=s.id
    left join disciplines d on d.id=l.discipline_id
    group by pt.code,s.code,w.sort_order order by w.sort_order`)).rows;
  const backendPhases = {};
  for (const row of references) {
    (backendPhases[row.type] ??= []).push({ name: row.name, disciplines: row.disciplines });
  }
  const referenceDisciplines = (await db.query("select code from disciplines order by code")).rows.map(row => row.code);
  return { backendPhases, referenceDisciplines };
}

export function createReferenceCache({ ttlMs = 60_000, now = Date.now } = {}) {
  let cached;
  let pending;
  let generation = 0;
  return {
    async get(db) {
      if (cached && now() < cached.expiresAt) return structuredClone(cached.value);
      if (!pending) {
        const version = generation;
        const request = readReferences(db).then(value => {
          if (version === generation) cached = { value, expiresAt: now() + ttlMs };
          return value;
        }).finally(() => {
          if (pending === request) pending = undefined;
        });
        pending = request;
      }
      return structuredClone(await pending);
    },
    clear() {
      generation += 1;
      cached = undefined;
      pending = undefined;
    },
  };
}

// Process-local on Vercel: cold starts read from Postgres again. Authentication
// still runs before every workspace read; login refreshes these shared lookups.
export const workspaceReferences = createReferenceCache();
