import { HttpError, isUuid } from "../../common/utilities/access.utility.js";

export async function reviewSitePhoto(db, user, project, command) {
  if (user.role !== "admin" && (user.role !== "opm" || project.suggested_opm_id !== user.id)) {
    throw new HttpError(403, "Only the assigned Office PM or an Administrator can review site photos.");
  }
  if (!isUuid(command.photoId)) throw new HttpError(400, "photoId must be a valid id.");

  const photo = (await db.query(
    "select id,uploaded_by,caption from project_photos where id=$1 and project_id=$2 and review_status='pending' and not is_client_visible for update",
    [command.photoId, project.id],
  )).rows[0];
  if (!photo) throw new HttpError(404, "Photo is no longer awaiting review.");

  if (command.type === "reject_photo") {
    const note = typeof command.note === "string" ? command.note.trim() : "";
    if (!note || note.length > 2000) {
      throw new HttpError(400, "Enter a rejection reason (up to 2,000 characters) so the uploader can correct the photo.");
    }
    await db.query(
      "update project_photos set review_status='rejected',review_note=$3,reviewed_by=$4,reviewed_at=now(),is_client_visible=false where id=$1 and project_id=$2",
      [command.photoId, project.id, note, user.id],
    );
    return {
      title: "Site photo returned for changes",
      detail: `${photo.caption || "Site photo"} · ${note}`,
      recipientIds: photo.uploaded_by ? [photo.uploaded_by] : [],
    };
  }

  await db.query(
    "update project_photos set review_status='released',review_note=null,reviewed_by=$3,reviewed_at=now(),is_client_visible=true,released_by=$3,released_at=now() where id=$1 and project_id=$2",
    [command.photoId, project.id, user.id],
  );
  return {
    title: "Site photo released to client",
    detail: photo.caption || "Site photo",
    recipientIds: [],
  };
}
