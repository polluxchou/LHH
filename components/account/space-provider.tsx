"use client";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";
import { seedSpaceContent, LIN_HAHA_MEMBER_MAP } from "@/lib/workflow/seed-space-content";
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
  /** seeded, space-scoped content state for the current space */
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
  userId, email, profile, mySpaces, membersBySpace, initialSpaceId, children,
}: {
  userId: string; email: string; profile: Profile | null;
  mySpaces: MySpace[];
  membersBySpace: Record<string, SpaceMember[]>;
  initialSpaceId?: string;
  children: ReactNode;
}) {
  const firstValid = initialSpaceId && mySpaces.some((s) => s.space.id === initialSpaceId)
    ? initialSpaceId
    : (mySpaces[0]?.space.id ?? null);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(firstValid);
  // Per-space content cache in a ref (mutating it must not trigger a render);
  // `version` is bumped explicitly when content changes so consumers re-render.
  const cacheRef = useRef<Record<string, LocalWorkflowState>>({});
  const [version, setVersion] = useState(0);

  const current = mySpaces.find((s) => s.space.id === currentSpaceId) ?? null;
  const members = useMemo(
    () => (currentSpaceId ? (membersBySpace[currentSpaceId] ?? []) : []),
    [currentSpaceId, membersBySpace],
  );

  const contentState = useMemo(() => {
    if (!currentSpaceId || !current) return null;
    if (!cacheRef.current[currentSpaceId]) {
      cacheRef.current[currentSpaceId] = seedSpaceContent({
        members,
        currentUserId: userId,
        contentMemberMap: current.space.name === "聊太空" ? LIN_HAHA_MEMBER_MAP : undefined,
      });
    }
    return cacheRef.current[currentSpaceId];
    // `version` participates so a setContentState bump re-reads the mutated cache ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId, current, members, userId, version]);

  const value: SpaceSession = {
    userId, email, profile, mySpaces, currentSpaceId, setCurrentSpaceId,
    currentRole: current?.role ?? null,
    isOwnerOfCurrent: current?.isOwner ?? false,
    members,
    contentState,
    setContentState: (next) => {
      if (currentSpaceId) {
        cacheRef.current[currentSpaceId] = next;
        setVersion((v) => v + 1);
      }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
