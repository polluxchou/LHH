"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { MySpace, Profile, SpaceMember } from "@/lib/domain/account";

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
  setContentState: (next: LocalWorkflowState) => void;
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
  const firstValid = initialSpaceId && mySpaces.some((s) => s.space.id === initialSpaceId)
    ? initialSpaceId
    : (mySpaces[0]?.space.id ?? null);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(firstValid);

  // Local mutable copy for in-session editorial edits; re-synced to the server-built
  // content whenever it changes (e.g. after router.refresh() following a search/add).
  const [store, setStore] = useState<Record<string, LocalWorkflowState>>(contentBySpace);
  useEffect(() => { setStore(contentBySpace); }, [contentBySpace]);

  const current = mySpaces.find((s) => s.space.id === currentSpaceId) ?? null;
  const members = currentSpaceId ? (membersBySpace[currentSpaceId] ?? []) : [];
  const contentState = currentSpaceId ? (store[currentSpaceId] ?? null) : null;

  const value: SpaceSession = {
    userId, email, profile, mySpaces, currentSpaceId, setCurrentSpaceId,
    currentRole: current?.role ?? null,
    isOwnerOfCurrent: current?.isOwner ?? false,
    members,
    contentState,
    setContentState: (next) => {
      if (currentSpaceId) setStore((prev) => ({ ...prev, [currentSpaceId]: next }));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
