/**
 * Authorization for deleting a tracking object.
 *
 * A tracking object may be deleted by the person who created it, or by a space
 * admin / owner (for housekeeping). Objects with no recorded creator — seeded
 * demo/team data migrated before `created_by` existed — are never user-deletable.
 *
 * Used in two places: the workbench shows the delete button when this is true,
 * and the server action re-checks it authoritatively (the client is not trusted).
 */
export function canDeleteTrackingObject(input: {
  createdBy?: string | null;
  userId?: string | null;
  role?: "admin" | "member" | null;
  isOwner?: boolean;
}): boolean {
  const { createdBy, userId, role, isOwner } = input;
  if (isOwner === true) return true;
  if (role === "admin") return true;
  return Boolean(createdBy && userId && createdBy === userId);
}
