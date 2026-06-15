/** Cookie that persists the user's selected space across navigation and refresh. */
export const SPACE_COOKIE = "signals.space";

/**
 * Pick which space a freshly-mounted SpaceProvider should show.
 *
 * Priority: an explicit choice (e.g. the home page's `?space=` deep link) wins,
 * then the persisted cookie, then the first space. Any candidate that isn't one of
 * the user's member spaces is ignored, so a stale cookie can never strand the user
 * on a space they no longer belong to.
 */
export function resolveInitialSpaceId(
  candidates: { explicit?: string | null; cookie?: string | null },
  mySpaceIds: string[],
): string | null {
  const valid = (id?: string | null) => (id && mySpaceIds.includes(id) ? id : null);
  return valid(candidates.explicit) ?? valid(candidates.cookie) ?? (mySpaceIds[0] ?? null);
}
