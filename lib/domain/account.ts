export type SpaceRole = "admin" | "member";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Profile {
  id: string;
  displayName: string;
  avatarChar: string;
  color: string;
}

export interface Application {
  id: string;
  name: string;
  ownerId: string;
}

export interface Space {
  id: string;
  applicationId: string;
  name: string;
  theme: string;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  title: string;
  profile: Profile;
}

export interface SpaceInvite {
  id: string;
  spaceId: string;
  email: string;
  token: string;
  role: SpaceRole;
  invitedBy: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}

/** A space the current user belongs to, plus their role in it. */
export interface MySpace {
  space: Space;
  role: SpaceRole;
  /** true when the current user owns the application that owns this space */
  isOwner: boolean;
}
