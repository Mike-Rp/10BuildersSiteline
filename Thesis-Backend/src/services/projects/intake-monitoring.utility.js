export async function monitoringProject(db, project) {
  const row=(await db.query("SELECT p.* FROM projects p WHERE id=$1 AND to_jsonb(p)->>'intake_monitoring_version'='1'", [project.id])).rows[0];
  return Number(row?.intake_monitoring_version)===1 ? row : null;
}
