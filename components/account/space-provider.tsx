"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { MySpace, Profile, SpaceMember } from "@/lib/domain/account";
import { resolveInitialSpaceId, SPACE_COOKIE } from "@/lib/account/resolve-space";

export interface SpaceSession {
  userId: string;
  email: string;
  profile: Profile | null;
  mySpaces: MySpace[];
  currentSpaceId: string | null;
  setCurrentSpaceId: (id: string) => void;
  currentRole: "admin" | "member" | null;
  isOwnerOfCurrent: boolean;
  /** members of the current space (real, from account layer) */
  members: SpaceMember[];
  /** space-scoped workbench state for the current space (DB content + editorial overlay) */
  contentState: LocalWorkflowState | null;
  setContentState: (
    next: LocalWorkflowState | ((prev: LocalWorkflowState | null) => LocalWorkflowState),
  ) => void;
}

const Ctx = createContext<SpaceSession | null>(null);
export const useSpaceSession = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSpaceSession must be used inside <SpaceProvider>");
  return v;
};

export function SpaceProvider({
  userId, email, profile, mySpaces, membersBySpace, contentBySpace, initialSpaceId, children,
}: {
  userId: string; email: string; profile: Profile | null;
  mySpaces: MySpace[];
  membersBySpace: Record<string, SpaceMember[]>;
  /** per-space workbench state, built server-side (AccountShell) so fid/node:crypto stays off the client */
  contentBySpace: Record<string, LocalWorkflowState>;
  initialSpaceId?: string;
  children: ReactNode;
}) {
  // AccountShell already resolved explicit `?space=` + cookie server-side into
  // `initialSpaceId`; this just re-validates against the member list defensively.
  const firstValid = resolveInitialSpaceId({ explicit: initialSpaceId }, mySpaces.map((s) => s.space.id));
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(firstValid);

  // Persist the selection so it survives navigation (each view is its own route that
  // remounts this provider) and refresh. AccountShell reads this cookie server-side.
  const selectSpace = useCallback((id: string) => {
    setCurrentSpaceId(id);
    if (typeof document !== "undefined") {
      document.cookie = `${SPACE_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  // Local mutable copy for in-session editorial edits; re-synced to the server-built
  // content whenever it changes (e.g. after router.refresh() following a search/add).
  const [store, setStore] = useState<Record<string, LocalWorkflowState>>(contentBySpace);
  useEffect(() => { setStore(contentBySpace); }, [contentBySpace]);

  const current = mySpaces.find((s) => s.space.id === currentSpaceId) ?? null;
  const members = currentSpaceId ? (membersBySpace[currentSpaceId] ?? []) : [];
  const contentState = currentSpaceId ? (store[currentSpaceId] ?? null) : null;

  const value: SpaceSession = {
    userId, email, profile, mySpaces, currentSpaceId, setCurrentSpaceId: selectSpace,
    currentRole: current?.role ?? null,
    isOwnerOfCurrent: current?.isOwner ?? false,
    members,
    contentState,
    setContentState: (next) => {
      if (!currentSpaceId) return;
      // Use the functional setStore form so sequential updates within one event
      // compose off the latest state (avoids last-write-wins clobbering).
      setStore((prev) => ({
        ...prev,
        [currentSpaceId]: typeof next === "function" ? next(prev[currentSpaceId] ?? null) : next,
      }));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
