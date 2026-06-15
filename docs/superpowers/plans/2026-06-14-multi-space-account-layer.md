# Multi-Space Account Layer Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a single-org → multi-space → members account layer (Supabase-persisted, magic-link auth, email invites) on top of the existing fixture-driven 林哈哈聊太空 workbench, with content scoped per space in memory.

**Architecture:** Account data (applications / spaces / space_members / space_invites / profiles + Supabase Auth) lives in Supabase with RLS and server-side cookie sessions. A new `SpaceProvider` sits above the existing `WorkflowProvider`; it loads the user's spaces, tracks the current space, and seeds a per-space in-memory copy of the fixtures (`seedSpaceContent`) whose member references are remapped onto the space's real members. Content is NOT persisted this phase (resets on refresh); only the account layer persists.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · `@supabase/supabase-js` + `@supabase/ssr` · PostgreSQL (Supabase) · vitest.

**Spec:** [docs/superpowers/specs/2026-06-14-multi-space-account-layer-design.md](../specs/2026-06-14-multi-space-account-layer-design.md)

---

## File Structure

**New files:**
- `supabase/migrations/0002_account_layer.sql` — account tables + RLS
- `lib/supabase/browser.ts` / `server.ts` / `middleware.ts` / `admin.ts` — Supabase client factories
- `lib/domain/account.ts` — account-layer types
- `lib/account/invite.ts` (+ test) — pure invite state-machine logic
- `lib/account/permissions.ts` (+ test) — pure role/permission predicates
- `lib/account/queries.ts` / `mutations.ts` — server-side data access (RLS + service-role)
- `lib/workflow/seed-space-content.ts` (+ test) — clone fixtures + remap members per space
- `middleware.ts` — session refresh + route protection
- `app/login/page.tsx` / `app/zh/login/page.tsx` + `components/auth/login-form.tsx` — login
- `app/auth/confirm/route.ts` — OTP/magic-link callback
- `app/invite/[token]/page.tsx` + `components/auth/invite-acceptance.tsx` — invite landing
- `app/no-space/page.tsx` / `app/zh/no-space/page.tsx` — empty state
- `app/spaces/page.tsx` / `app/zh/spaces/page.tsx` — owner all-spaces overview
- `components/account/space-provider.tsx` — session + spaces + current space + per-space content store
- `components/account/space-switcher.tsx` / `account-menu.tsx` — top-nav controls
- `components/account/member-panel.tsx` / `invite-dialog.tsx` / `create-space-dialog.tsx`
- `scripts/seed-account.ts` — seed owner + 聊太空 + 3 members
- `lib/i18n/account-copy.ts` — bilingual strings for new surfaces

**Modified files:**
- `app/layout.tsx` — wrap children in `SpaceProvider`
- `components/workbench/workflow-provider.tsx` — become space-scoped
- `components/workbench/top-nav.tsx` — swap fake member switcher for space switcher + account menu
- `components/workbench/app-frame.tsx` — feed real members
- `package.json` — add deps
- `.env.example` / `README.md` — setup docs

---

## Task 0: Project prerequisites

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Initialize git (repo is not yet versioned)**

Run:
```bash
git init
git add -A
git commit -m "chore: snapshot before account-layer work

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: a baseline commit so subsequent task commits are diffable.

- [ ] **Step 2: Install Supabase deps**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
```
Expected: both appear under `dependencies` in `package.json`.

- [ ] **Step 3: Create `.env.example`**

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
# Base URL used to build invite links
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 4: Copy to `.env.local` and start local Supabase**

Run:
```bash
cp .env.example .env.local
supabase start
```
Expected: `supabase start` prints the local `anon key` and `service_role key`; paste them into `.env.local`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add supabase deps and env scaffolding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 1: Account-layer migration

**Files:**
- Create: `supabase/migrations/0002_account_layer.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_account_layer.sql

create extension if not exists pgcrypto;

-- Public mirror of auth.users for display fields.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_char text not null default '·',
  color text not null default '#8b5e3c',
  created_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  name text not null,
  theme text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  title text not null default '',
  joined_at timestamptz not null default now(),
  unique (space_id, user_id)
);

-- At most one admin per space.
create unique index space_members_one_admin_idx
  on space_members (space_id)
  where role = 'admin';

create table space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- At most one pending invite per (space, email).
create unique index space_invites_one_pending_idx
  on space_invites (space_id, email)
  where status = 'pending';

create index space_members_user_idx on space_members (user_id);
create index spaces_application_idx on spaces (application_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table applications enable row level security;
alter table spaces enable row level security;
alter table space_members enable row level security;
alter table space_invites enable row level security;

-- Helper: is the current user a member of a given space?
create or replace function is_space_member(target_space uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members
    where space_id = target_space and user_id = auth.uid()
  );
$$;

-- Helper: is the current user the admin of a given space?
create or replace function is_space_admin(target_space uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members
    where space_id = target_space and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: is the current user the owner of the application owning a space?
create or replace function is_space_owner(target_space uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from spaces s
    join applications a on a.id = s.application_id
    where s.id = target_space and a.owner_id = auth.uid()
  );
$$;

-- profiles
create policy profiles_self_rw on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_shared_read on profiles
  for select using (
    exists (
      select 1 from space_members me
      join space_members them on them.space_id = me.space_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

-- applications
create policy applications_owner_rw on applications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy applications_member_read on applications
  for select using (
    exists (
      select 1 from spaces s
      join space_members m on m.space_id = s.id
      where s.application_id = applications.id and m.user_id = auth.uid()
    )
  );

-- spaces
create policy spaces_member_read on spaces
  for select using (is_space_member(id) or is_space_owner(id));
create policy spaces_admin_update on spaces
  for update using (is_space_admin(id) or is_space_owner(id));
create policy spaces_owner_insert on spaces
  for insert with check (
    exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid())
  );

-- space_members
create policy space_members_read on space_members
  for select using (is_space_member(space_id) or is_space_owner(space_id));
create policy space_members_manage on space_members
  for all using (is_space_admin(space_id) or is_space_owner(space_id))
  with check (is_space_admin(space_id) or is_space_owner(space_id));

-- space_invites (server-side acceptance uses service-role; these cover admin/owner management)
create policy space_invites_manage on space_invites
  for all using (is_space_admin(space_id) or is_space_owner(space_id))
  with check (is_space_admin(space_id) or is_space_owner(space_id));
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
supabase db reset
```
Expected: both `0001_*` and `0002_account_layer.sql` apply with no errors.

- [ ] **Step 3: Verify tables exist**

Run:
```bash
psql "$DATABASE_URL" -c "\dt public.*" | grep -E "applications|spaces|space_members|space_invites|profiles"
```
(`DATABASE_URL` = the local Postgres URL from `supabase status`.)
Expected: all five table names listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_account_layer.sql
git commit -m "feat: add account-layer schema and RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Supabase client factories

**Files:**
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `lib/supabase/admin.ts`

- [ ] **Step 1: Browser client**

```ts
// lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Server client (RLS, reads cookies)**

```ts
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — safe to ignore; middleware refreshes the session
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Middleware client helper**

```ts
// lib/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  return { supabase, response: () => response };
}
```

- [ ] **Step 4: Service-role admin client (server only)**

```ts
// lib/supabase/admin.ts
import { createClient } from "@supabase/supabase-js";

/** Bypasses RLS. NEVER import from client components. */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add lib/supabase
git commit -m "feat: add supabase client factories

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Account-layer domain types

**Files:**
- Create: `lib/domain/account.ts`

- [ ] **Step 1: Write the types**

```ts
// lib/domain/account.ts
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
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add lib/domain/account.ts
git commit -m "feat: add account-layer domain types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Invite logic (pure, TDD)

**Files:**
- Create: `lib/account/invite.ts`
- Test: `lib/account/invite.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/account/invite.test.ts
import { describe, expect, it } from "vitest";
import { evaluateInvite, canAcceptInvite, generateInviteToken } from "./invite";
import type { SpaceInvite } from "@/lib/domain/account";

const base: SpaceInvite = {
  id: "i1",
  spaceId: "s1",
  email: "new@x.com",
  token: "tok",
  role: "member",
  invitedBy: "u1",
  status: "pending",
  expiresAt: "2026-06-20T00:00:00.000Z",
  createdAt: "2026-06-14T00:00:00.000Z",
  acceptedAt: null,
};
const NOW = "2026-06-15T00:00:00.000Z";

describe("evaluateInvite", () => {
  it("returns valid for a pending, unexpired invite", () => {
    expect(evaluateInvite(base, NOW)).toEqual({ ok: true });
  });
  it("flags expired when past expires_at", () => {
    expect(evaluateInvite({ ...base, expiresAt: "2026-06-14T12:00:00.000Z" }, NOW))
      .toEqual({ ok: false, reason: "expired" });
  });
  it("flags revoked invites", () => {
    expect(evaluateInvite({ ...base, status: "revoked" }, NOW)).toEqual({ ok: false, reason: "revoked" });
  });
  it("flags already-accepted invites", () => {
    expect(evaluateInvite({ ...base, status: "accepted" }, NOW)).toEqual({ ok: false, reason: "accepted" });
  });
});

describe("canAcceptInvite", () => {
  it("allows when session email matches (case-insensitive)", () => {
    expect(canAcceptInvite(base, "NEW@x.com", NOW)).toEqual({ ok: true });
  });
  it("blocks when session email differs", () => {
    expect(canAcceptInvite(base, "other@x.com", NOW)).toEqual({ ok: false, reason: "email_mismatch" });
  });
  it("blocks an expired invite even with matching email", () => {
    expect(canAcceptInvite({ ...base, expiresAt: "2026-06-14T00:00:00.000Z" }, "new@x.com", NOW))
      .toEqual({ ok: false, reason: "expired" });
  });
});

describe("generateInviteToken", () => {
  it("produces a URL-safe token of reasonable length", () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/account/invite.test.ts`
Expected: FAIL — module `./invite` not found.

- [ ] **Step 3: Implement**

```ts
// lib/account/invite.ts
import type { SpaceInvite } from "@/lib/domain/account";

export type InviteCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "revoked" | "accepted" | "email_mismatch" };

export function evaluateInvite(invite: SpaceInvite, nowIso: string): InviteCheck {
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "accepted") return { ok: false, reason: "accepted" };
  if (new Date(invite.expiresAt).getTime() <= new Date(nowIso).getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function canAcceptInvite(invite: SpaceInvite, sessionEmail: string, nowIso: string): InviteCheck {
  const valid = evaluateInvite(invite, nowIso);
  if (!valid.ok) return valid;
  if (invite.email.trim().toLowerCase() !== sessionEmail.trim().toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true };
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/account/invite.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/account/invite.ts lib/account/invite.test.ts
git commit -m "feat: add invite state-machine logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Permission predicates (pure, TDD)

**Files:**
- Create: `lib/account/permissions.ts`
- Test: `lib/account/permissions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/account/permissions.test.ts
import { describe, expect, it } from "vitest";
import { canCreateSpace, canManageMembers, canIssueInvite } from "./permissions";

describe("permissions", () => {
  it("only owner can create spaces", () => {
    expect(canCreateSpace({ isOwner: true, role: "member" })).toBe(true);
    expect(canCreateSpace({ isOwner: false, role: "admin" })).toBe(false);
  });
  it("owner or space admin can manage members", () => {
    expect(canManageMembers({ isOwner: true, role: "member" })).toBe(true);
    expect(canManageMembers({ isOwner: false, role: "admin" })).toBe(true);
    expect(canManageMembers({ isOwner: false, role: "member" })).toBe(false);
  });
  it("admins may issue member invites but only owner may issue admin invites", () => {
    expect(canIssueInvite({ isOwner: false, role: "admin" }, "member")).toBe(true);
    expect(canIssueInvite({ isOwner: false, role: "admin" }, "admin")).toBe(false);
    expect(canIssueInvite({ isOwner: true, role: "member" }, "admin")).toBe(true);
    expect(canIssueInvite({ isOwner: false, role: "member" }, "member")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/account/permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/account/permissions.ts
import type { SpaceRole } from "@/lib/domain/account";

export interface ActorContext {
  isOwner: boolean;
  role: SpaceRole;
}

export function canCreateSpace(actor: ActorContext): boolean {
  return actor.isOwner;
}

export function canManageMembers(actor: ActorContext): boolean {
  return actor.isOwner || actor.role === "admin";
}

export function canIssueInvite(actor: ActorContext, inviteRole: SpaceRole): boolean {
  if (inviteRole === "admin") return actor.isOwner;
  return canManageMembers(actor);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/account/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/account/permissions.ts lib/account/permissions.test.ts
git commit -m "feat: add account permission predicates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: seedSpaceContent (pure, TDD)

**Files:**
- Create: `lib/workflow/seed-space-content.ts`
- Test: `lib/workflow/seed-space-content.test.ts`

**Context:** `createInitialWorkflowState()` (`lib/workflow/local-workflow.ts:131`) returns a `LocalWorkflowState` seeded from fixtures whose `teamMembers` are `u-lin`/`u-zhou`/`u-he`. This task produces a space-scoped state: same content, but `teamMembers`/`currentMemberId` and all member references remapped onto the space's REAL members.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/workflow/seed-space-content.test.ts
import { describe, expect, it } from "vitest";
import { seedSpaceContent, LIN_HAHA_MEMBER_MAP } from "./seed-space-content";
import type { SpaceMember } from "@/lib/domain/account";

function member(userId: string, role: "admin" | "member", name: string): SpaceMember {
  return {
    id: `m-${userId}`, spaceId: "s1", userId, role, title: role === "admin" ? "管理员" : "成员",
    profile: { id: userId, displayName: name, avatarChar: name[0], color: "#123456" },
  };
}

describe("seedSpaceContent — 聊太空 (explicit map, name-based)", () => {
  // Real user ids are arbitrary uuids; the map resolves fixture ids → real ids by display name.
  const members = [member("uid-lin", "admin", "林哈哈"), member("uid-zhou", "member", "周野"), member("uid-he", "member", "何远")];
  const map = LIN_HAHA_MEMBER_MAP; // { "u-lin": "林哈哈", "u-zhou": "周野", "u-he": "何远" }

  it("replaces teamMembers with the real members", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-zhou", contentMemberMap: map });
    expect(state.teamMembers.map((m) => m.id).sort()).toEqual(["uid-he", "uid-lin", "uid-zhou"]);
    expect(state.currentMemberId).toBe("uid-zhou");
  });

  it("remaps topic-card ownerId from fixture id to real id", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-lin", contentMemberMap: map });
    // every ownerId present must be a real member id (or null), never a fixture id
    const ids = new Set(["uid-lin", "uid-zhou", "uid-he"]);
    for (const card of state.topicCards) {
      if (card.ownerId) expect(ids.has(card.ownerId)).toBe(true);
    }
  });

  it("carries fixture subscriptions onto the mapped member", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-lin", contentMemberMap: map });
    const lin = state.teamMembers.find((m) => m.id === "uid-lin")!;
    expect(lin.trackingObjectIds.length).toBeGreaterThan(0);
  });
});

describe("seedSpaceContent — new space (heuristic)", () => {
  const members = [member("uid-a", "admin", "甲"), member("uid-b", "member", "乙")];

  it("falls back to admin-first round-robin when no explicit map given", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-a" });
    expect(state.teamMembers.map((m) => m.id)).toEqual(["uid-a", "uid-b"]);
    // no content reference points at a fixture id
    const realIds = new Set(["uid-a", "uid-b"]);
    for (const card of state.topicCards) {
      if (card.ownerId) expect(realIds.has(card.ownerId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/workflow/seed-space-content.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/workflow/seed-space-content.ts
import { createInitialWorkflowState, type LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { SpaceMember } from "@/lib/domain/account";
import type { TeamMember } from "@/lib/domain/types";

/** Fixture-member-id → 聊太空 member DISPLAY NAME (stable across uuid churn). */
export const LIN_HAHA_MEMBER_MAP: Record<string, string> = {
  "u-lin": "林哈哈",
  "u-zhou": "周野",
  "u-he": "何远",
};

interface SeedArgs {
  members: SpaceMember[];
  currentUserId: string;
  /** explicit fixture-id → display-name map (聊太空). Omit for new spaces (heuristic). */
  contentMemberMap?: Record<string, string>;
}

export function seedSpaceContent({ members, currentUserId, contentMemberMap }: SeedArgs): LocalWorkflowState {
  const fixtureState = createInitialWorkflowState();
  const fixtureMembers = fixtureState.teamMembers;

  // Build fixtureMemberId → realUserId.
  const map: Record<string, string> = {};
  if (contentMemberMap) {
    // Resolve fixture id → display name → real user id.
    const byName: Record<string, string> = {};
    for (const m of members) byName[m.profile.displayName] = m.userId;
    for (const [fixtureId, name] of Object.entries(contentMemberMap)) {
      if (byName[name]) map[fixtureId] = byName[name];
    }
  } else {
    // Heuristic: admin first, then members round-robin over fixture slots.
    const ordered = [...members].sort((a, b) => (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0));
    fixtureMembers.forEach((fm, i) => {
      if (ordered.length > 0) map[fm.id] = ordered[i % ordered.length].userId;
    });
  }
  const realIds = new Set(members.map((m) => m.userId));
  const remapId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const mapped = map[id] ?? id;
    return realIds.has(mapped) ? mapped : (members[0]?.userId ?? null);
  };

  // Real members in TeamMember shape, inheriting fixture subscriptions through the map.
  const subsByReal: Record<string, Set<string>> = {};
  for (const fm of fixtureMembers) {
    const real = map[fm.id];
    if (!real) continue;
    subsByReal[real] = new Set([...(subsByReal[real] ?? []), ...fm.trackingObjectIds]);
  }
  const teamMembers: TeamMember[] = members.map((m) => ({
    id: m.userId,
    name: m.profile.displayName,
    role: m.title,
    avatarChar: m.profile.avatarChar,
    color: m.profile.color,
    trackingObjectIds: [...(subsByReal[m.userId] ?? [])],
  }));

  return {
    ...fixtureState,
    teamMembers,
    currentMemberId: realIds.has(currentUserId) ? currentUserId : (members[0]?.userId ?? currentUserId),
    topicCards: fixtureState.topicCards.map((c) => ({ ...c, ownerId: remapId(c.ownerId) })),
    screeningDecisions: fixtureState.screeningDecisions.map((d) => ({
      ...d,
      decidedBy: remapId(d.decidedBy) ?? d.decidedBy,
    })),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/workflow/seed-space-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/seed-space-content.ts lib/workflow/seed-space-content.test.ts
git commit -m "feat: add per-space fixture seeding with member remap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Server data access (queries + mutations)

**Files:**
- Create: `lib/account/queries.ts`, `lib/account/mutations.ts`

**Context:** Row-shape helpers convert snake_case DB rows to the camelCase types in `lib/domain/account.ts`. Queries use the RLS-bound server client; mutations that must bypass RLS (accept invite) use the admin client and re-check permissions in code.

- [ ] **Step 1: Implement queries**

```ts
// lib/account/queries.ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MySpace, Profile, SpaceInvite, SpaceMember } from "@/lib/domain/account";

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user; // null if not logged in
}

export async function getMySpaces(): Promise<MySpace[]> {
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];
  const { data, error } = await supabase
    .from("space_members")
    .select("role, spaces!inner(id, application_id, name, theme, applications!inner(owner_id))");
  if (error || !data) return [];
  return data.map((row: any) => ({
    space: {
      id: row.spaces.id,
      applicationId: row.spaces.application_id,
      name: row.spaces.name,
      theme: row.spaces.theme,
    },
    role: row.role,
    isOwner: row.spaces.applications.owner_id === user.user!.id,
  }));
}

export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("space_members")
    .select("id, space_id, user_id, role, title, profiles!inner(id, display_name, avatar_char, color)")
    .eq("space_id", spaceId);
  return (data ?? []).map((r: any): SpaceMember => ({
    id: r.id, spaceId: r.space_id, userId: r.user_id, role: r.role, title: r.title,
    profile: { id: r.profiles.id, displayName: r.profiles.display_name, avatarChar: r.profiles.avatar_char, color: r.profiles.color },
  }));
}

export async function getPendingInvites(spaceId: string): Promise<SpaceInvite[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("space_invites")
    .select("*")
    .eq("space_id", spaceId)
    .eq("status", "pending");
  return (data ?? []).map(mapInviteRow);
}

export function mapInviteRow(r: any): SpaceInvite {
  return {
    id: r.id, spaceId: r.space_id, email: r.email, token: r.token, role: r.role,
    invitedBy: r.invited_by, status: r.status, expiresAt: r.expires_at,
    createdAt: r.created_at, acceptedAt: r.accepted_at,
  };
}
```

- [ ] **Step 2: Implement mutations (server actions)**

```ts
// lib/account/mutations.ts
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken, canAcceptInvite } from "@/lib/account/invite";
import { canCreateSpace, canIssueInvite, type ActorContext } from "@/lib/account/permissions";
import { getMySpaces, mapInviteRow } from "@/lib/account/queries";
import type { SpaceRole } from "@/lib/domain/account";

async function actorFor(spaceId: string): Promise<ActorContext | null> {
  const mine = await getMySpaces();
  const match = mine.find((m) => m.space.id === spaceId);
  return match ? { isOwner: match.isOwner, role: match.role } : null;
}

export async function createInvite(input: { spaceId: string; email: string; role: SpaceRole }) {
  const actor = await actorFor(input.spaceId);
  if (!actor || !canIssueInvite(actor, input.role)) throw new Error("forbidden");
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  // revoke any existing pending invite for the same (space,email) first
  await supabase.from("space_invites").update({ status: "revoked" })
    .eq("space_id", input.spaceId).eq("email", input.email).eq("status", "pending");
  const { data, error } = await supabase.from("space_invites").insert({
    space_id: input.spaceId, email: input.email.trim().toLowerCase(), token,
    role: input.role, invited_by: user.user!.id, expires_at: expiresAt,
  }).select("*").single();
  if (error) throw new Error(error.message);
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${token}`;
  return { invite: mapInviteRow(data), link };
}

export async function revokeInvite(inviteId: string, spaceId: string) {
  const actor = await actorFor(spaceId);
  if (!actor) throw new Error("forbidden");
  const supabase = await createSupabaseServerClient();
  await supabase.from("space_invites").update({ status: "revoked" }).eq("id", inviteId);
}

export async function acceptInvite(token: string, profile: { displayName: string; avatarChar: string; color: string }) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("not_authenticated");

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from("space_invites").select("*").eq("token", token).single();
  if (!row) throw new Error("invite_not_found");
  const invite = mapInviteRow(row);
  const check = canAcceptInvite(invite, user.email ?? "", new Date().toISOString());
  if (!check.ok) throw new Error(check.reason);

  // ensure profile, add membership, close invite — all via admin (bypasses RLS deliberately)
  await admin.from("profiles").upsert({
    id: user.id, display_name: profile.displayName, avatar_char: profile.avatarChar, color: profile.color,
  });
  await admin.from("space_members").insert({
    space_id: invite.spaceId, user_id: user.id, role: invite.role,
    title: invite.role === "admin" ? "管理员" : "成员",
  });
  await admin.from("space_invites").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invite.id);
  return { spaceId: invite.spaceId };
}

export async function createSpace(input: { name: string; theme: string; adminUserId?: string; adminEmail?: string }) {
  const mine = await getMySpaces();
  const owner = mine.find((m) => m.isOwner) ?? null;
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  // owner gate: the user must own an application
  const { data: app } = await supabase.from("applications").select("id, owner_id").eq("owner_id", user.user!.id).single();
  if (!app) throw new Error("forbidden");
  if (!canCreateSpace({ isOwner: true, role: owner?.role ?? "member" })) throw new Error("forbidden");

  const { data: space, error } = await supabase.from("spaces")
    .insert({ application_id: app.id, name: input.name, theme: input.theme }).select("*").single();
  if (error) throw new Error(error.message);

  if (input.adminUserId) {
    // existing account → assign admin directly
    const admin = createSupabaseAdminClient();
    await admin.from("space_members").insert({ space_id: space.id, user_id: input.adminUserId, role: "admin", title: "管理员" });
  } else if (input.adminEmail) {
    // new person → owner-issued admin invite
    await createInvite({ spaceId: space.id, email: input.adminEmail, role: "admin" });
  }
  return { spaceId: space.id };
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add lib/account/queries.ts lib/account/mutations.ts
git commit -m "feat: add account queries and server-action mutations

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Login page + auth callback

**Files:**
- Create: `components/auth/login-form.tsx`, `app/login/page.tsx`, `app/zh/login/page.tsx`, `app/auth/confirm/route.ts`

- [ ] **Step 1: Login form (client) — email OTP**

```tsx
// components/auth/login-form.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Locale } from "@/lib/i18n/copy";

export function LoginForm({ locale, next }: { locale: Locale; next?: string }) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { email: "邮箱", send: "发送验证码", code: "验证码", verify: "登录", sent: "验证码已发送，请查收邮箱" }
    : { email: "Email", send: "Send code", code: "Code", verify: "Sign in", sent: "Code sent — check your inbox" };

  async function send() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setError(error.message); else setSent(true);
  }
  async function verify() {
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) { setError(error.message); return; }
    router.replace(next ?? (locale === "zh" ? "/zh" : "/"));
    router.refresh();
  }

  return (
    <div className="auth-card">
      <label>{t.email}<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label>
      {!sent ? (
        <button onClick={send} disabled={!email}>{t.send}</button>
      ) : (
        <>
          <p>{t.sent}</p>
          <label>{t.code}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" /></label>
          <button onClick={verify} disabled={!code}>{t.verify}</button>
        </>
      )}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Login pages**

```tsx
// app/login/page.tsx
import { LoginForm } from "@/components/auth/login-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main className="auth-page"><LoginForm locale="en" next={next} /></main>;
}
```
```tsx
// app/zh/login/page.tsx
import { LoginForm } from "@/components/auth/login-form";
export default async function ZhLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main className="auth-page"><LoginForm locale="zh" next={next} /></main>;
}
```

- [ ] **Step 3: Magic-link callback route**

```ts
// app/auth/confirm/route.ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";
  if (token_hash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/login`, request a code.
Check local inbox: `supabase` local prints magic-link emails to the Inbucket UI at `http://127.0.0.1:54324`.
Expected: code/link works, redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add components/auth/login-form.tsx app/login app/zh/login app/auth/confirm
git commit -m "feat: add magic-link login and auth callback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Middleware — session refresh + route protection

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Implement**

```ts
// middleware.ts
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

const PUBLIC_PREFIXES = ["/login", "/zh/login", "/invite", "/auth"];

export async function middleware(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

  if (!data.user && !isPublic) {
    const isZh = path.startsWith("/zh");
    const url = request.nextUrl.clone();
    url.pathname = isZh ? "/zh/login" : "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. In a private window, open `http://localhost:3000/` while logged out.
Expected: redirect to `/login?next=/`. Open `/zh` → redirect to `/zh/login?next=/zh`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: protect routes and refresh session in middleware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: SpaceProvider — session, spaces, current space, per-space content store

**Files:**
- Create: `components/account/space-provider.tsx`

**Context:** Wraps the app. Receives server-fetched `mySpaces` + `currentUser`, holds the active space id, and lazily builds a `Map<spaceId, LocalWorkflowState>` via `seedSpaceContent`. Exposes everything `WorkflowProvider` (Task 11) needs.

- [ ] **Step 1: Implement**

```tsx
// components/account/space-provider.tsx
"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
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
  userId, email, profile, mySpaces, membersBySpace, children,
}: {
  userId: string; email: string; profile: Profile | null;
  mySpaces: MySpace[];
  membersBySpace: Record<string, SpaceMember[]>;
  children: ReactNode;
}) {
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(mySpaces[0]?.space.id ?? null);
  const [store, setStore] = useState<Record<string, LocalWorkflowState>>({});

  const current = mySpaces.find((s) => s.space.id === currentSpaceId) ?? null;
  const members = currentSpaceId ? (membersBySpace[currentSpaceId] ?? []) : [];

  const contentState = useMemo(() => {
    if (!currentSpaceId || !current) return null;
    if (store[currentSpaceId]) return store[currentSpaceId];
    const seeded = seedSpaceContent({
      members,
      currentUserId: userId,
      contentMemberMap: current.space.name === "聊太空" ? LIN_HAHA_MEMBER_MAP : undefined,
    });
    setStore((prev) => ({ ...prev, [currentSpaceId]: seeded }));
    return seeded;
  }, [currentSpaceId, current, members, userId, store]);

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
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add components/account/space-provider.tsx
git commit -m "feat: add SpaceProvider with per-space content store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Make WorkflowProvider space-scoped + wire layout

**Files:**
- Modify: `components/workbench/workflow-provider.tsx:95-131`
- Modify: `app/layout.tsx`
- Create: `components/account/account-shell.tsx`

**Context:** `WorkflowProvider` currently seeds its own `useState(createInitialWorkflowState)`. It must instead read/write the current space's `contentState` from `SpaceProvider`. The layout must fetch session+spaces server-side and mount `SpaceProvider` → `WorkflowProvider`.

- [ ] **Step 1: Point WorkflowProvider state at SpaceProvider**

Replace the state initialization in `components/workbench/workflow-provider.tsx`:
```tsx
// was: const [state, setState] = useState(createInitialWorkflowState);
import { useSpaceSession } from "@/components/account/space-provider";
// ...inside WorkflowProvider():
const session = useSpaceSession();
const state = session.contentState ?? createInitialWorkflowState();
const setState = (updater: LocalWorkflowState | ((c: LocalWorkflowState) => LocalWorkflowState)) => {
  const next = typeof updater === "function"
    ? (updater as (c: LocalWorkflowState) => LocalWorkflowState)(state)
    : updater;
  session.setContentState(next);
};
```
Keep the rest of the provider unchanged (all existing actions call `setState`).

- [ ] **Step 2: Create the server account-shell that fetches data**

```tsx
// components/account/account-shell.tsx
import { redirect } from "next/navigation";
import { getMySpaces, getSessionUser, getSpaceMembers } from "@/lib/account/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SpaceProvider } from "@/components/account/space-provider";
import { WorkflowProvider } from "@/components/workbench/workflow-provider";
import type { Profile, SpaceMember } from "@/lib/domain/account";
import type { ReactNode } from "react";

export async function AccountShell({ locale, children }: { locale: "en" | "zh"; children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect(locale === "zh" ? "/zh/login" : "/login");

  const mySpaces = await getMySpaces();
  if (mySpaces.length === 0) redirect(locale === "zh" ? "/zh/no-space" : "/no-space");

  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const profile: Profile | null = prof
    ? { id: prof.id, displayName: prof.display_name, avatarChar: prof.avatar_char, color: prof.color }
    : null;

  const membersBySpace: Record<string, SpaceMember[]> = {};
  for (const s of mySpaces) membersBySpace[s.space.id] = await getSpaceMembers(s.space.id);

  return (
    <SpaceProvider
      userId={user.id}
      email={user.email ?? ""}
      profile={profile}
      mySpaces={mySpaces}
      membersBySpace={membersBySpace}
    >
      <WorkflowProvider>{children}</WorkflowProvider>
    </SpaceProvider>
  );
}
```

- [ ] **Step 3: Update layout — remove the global WorkflowProvider**

```tsx
// app/layout.tsx  (body only)
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  );
}
```
(Remove the `WorkflowProvider` import + wrapper — providers now mount per-locale via `AccountShell`.)

- [ ] **Step 4: Wrap the workbench pages in AccountShell**

For each authed page (`app/page.tsx`, `app/zh/page.tsx`, and the sub-views under `app/*` / `app/zh/*` that render `AppFrame`), wrap `AppFrame` in `AccountShell`. Example for `app/page.tsx`:
```tsx
import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { Workbench } from "@/components/workbench/workbench";

export default function HomePage() {
  return (
    <AccountShell locale="en">
      <AppFrame locale="en"><Workbench /></AppFrame>
    </AccountShell>
  );
}
```
Apply the same wrap to: `app/zh/page.tsx`, `app/launches/page.tsx`, `app/topic-pool/page.tsx`, `app/map/page.tsx`, `app/tracking-objects/page.tsx`, `app/briefs/page.tsx`, and their `app/zh/*` counterparts.

- [ ] **Step 5: Verify the app still renders for a logged-in user**

Run: `npm run dev`, log in (Task 8), open `/`.
Expected: workbench renders with 聊太空 content; no `useWorkflow`/`useSpaceSession` provider errors in console. (Requires the seed from Task 17 for real spaces; until then, verify no compile errors via `npx tsc --noEmit`.)

- [ ] **Step 6: Commit**

```bash
git add components/workbench/workflow-provider.tsx components/account/account-shell.tsx app/layout.tsx app/**/page.tsx
git commit -m "feat: make workflow state space-scoped via SpaceProvider

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Top-nav — space switcher + account menu

**Files:**
- Create: `components/account/space-switcher.tsx`, `components/account/account-menu.tsx`
- Modify: `components/workbench/top-nav.tsx`, `components/workbench/app-frame.tsx`

- [ ] **Step 1: Space switcher**

```tsx
// components/account/space-switcher.tsx
"use client";
import { useState } from "react";
import { useSpaceSession } from "@/components/account/space-provider";

export function SpaceSwitcher({ locale }: { locale: "en" | "zh" }) {
  const s = useSpaceSession();
  const [open, setOpen] = useState(false);
  const current = s.mySpaces.find((m) => m.space.id === s.currentSpaceId);
  const newLabel = locale === "zh" ? "＋ 新建空间" : "+ New space";
  const allLabel = locale === "zh" ? "全部空间" : "All spaces";
  const ownsApp = s.mySpaces.some((m) => m.isOwner);
  return (
    <div className="space-switcher">
      <button className="space-trigger" onClick={() => setOpen((v) => !v)}>
        {current?.space.name ?? "—"} <span className="caret">▾</span>
      </button>
      {open ? (
        <div className="space-popover">
          {s.mySpaces.map((m) => (
            <button key={m.space.id} className={m.space.id === s.currentSpaceId ? "active" : ""}
              onClick={() => { s.setCurrentSpaceId(m.space.id); setOpen(false); }}>
              {m.space.name} <span className="space-theme">{m.space.theme}</span>
            </button>
          ))}
          {ownsApp ? (
            <>
              <a href={locale === "zh" ? "/zh/spaces" : "/spaces"}>{allLabel}</a>
              <a href={locale === "zh" ? "/zh/spaces?new=1" : "/spaces?new=1"}>{newLabel}</a>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Account menu (logout)**

```tsx
// components/account/account-menu.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSpaceSession } from "@/components/account/space-provider";

export function AccountMenu({ locale }: { locale: "en" | "zh" }) {
  const s = useSpaceSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const me = s.members.find((m) => m.userId === s.userId);
  const name = me?.profile.displayName ?? s.profile?.displayName ?? s.email;
  const roleLabel = s.isOwnerOfCurrent
    ? (locale === "zh" ? "所有者" : "Owner")
    : s.currentRole === "admin" ? (locale === "zh" ? "管理员" : "Admin") : (locale === "zh" ? "成员" : "Member");
  async function logout() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace(locale === "zh" ? "/zh/login" : "/login");
    router.refresh();
  }
  return (
    <div className="account-menu">
      <button onClick={() => setOpen((v) => !v)}>
        <span className="uavatar" style={{ background: me?.profile.color ?? "#888" }}>{me?.profile.avatarChar ?? name[0]}</span>
        <span className="utext"><span className="uname">{name}</span><span className="urole">{roleLabel}</span></span>
      </button>
      {open ? (
        <div className="account-popover">
          <button onClick={logout}>{locale === "zh" ? "登出" : "Sign out"}</button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Swap into top-nav**

In `components/workbench/top-nav.tsx`, remove the `members`/`currentMember`/`onSwitchMember` props and the `user-switcher` block (lines ~196–245), and render the new controls instead:
```tsx
import { SpaceSwitcher } from "@/components/account/space-switcher";
import { AccountMenu } from "@/components/account/account-menu";
// next to the brand divider:
<SpaceSwitcher locale={locale} />
// replacing the old user-switcher slot on the right:
<AccountMenu locale={locale} />
```

- [ ] **Step 4: Update app-frame to drop the fake switcher props**

In `components/workbench/app-frame.tsx`, remove `members`, `currentMember`, `onSwitchMember` from the `<TopNav .../>` call (keep `badges`). `AddTrackedDialog` still uses `store.currentMember` — that now resolves to the real current member from the seeded state (its `id` is the logged-in user's id), so it keeps working.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` (no errors), then `npm run dev` and confirm the space switcher + account menu render.
```bash
git add components/account/space-switcher.tsx components/account/account-menu.tsx components/workbench/top-nav.tsx components/workbench/app-frame.tsx
git commit -m "feat: replace fake member switcher with space switcher + account menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Member-management panel + invite dialog

**Files:**
- Create: `components/account/member-panel.tsx`, `components/account/invite-dialog.tsx`
- Create: `app/space/members/page.tsx`, `app/zh/space/members/page.tsx`

- [ ] **Step 1: Invite dialog (client → server action)**

```tsx
// components/account/invite-dialog.tsx
"use client";
import { useState } from "react";
import { createInvite } from "@/lib/account/mutations";

export function InviteDialog({ spaceId, canInviteAdmin, locale }: { spaceId: string; canInviteAdmin: boolean; locale: "en" | "zh" }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { email: "受邀邮箱", invite: "生成邀请链接", copy: "复制", admin: "设为管理员" }
    : { email: "Invitee email", invite: "Create invite link", copy: "Copy", admin: "As admin" };
  async function submit() {
    setError(null);
    try {
      const { link } = await createInvite({ spaceId, email, role });
      setLink(link);
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }
  return (
    <div className="invite-dialog">
      <input type="email" value={email} placeholder={t.email} onChange={(e) => setEmail(e.target.value)} />
      {canInviteAdmin ? (
        <label><input type="checkbox" checked={role === "admin"} onChange={(e) => setRole(e.target.checked ? "admin" : "member")} /> {t.admin}</label>
      ) : null}
      <button onClick={submit} disabled={!email}>{t.invite}</button>
      {link ? (
        <div className="invite-link">
          <code>{link}</code>
          <button onClick={() => navigator.clipboard.writeText(link)}>{t.copy}</button>
        </div>
      ) : null}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Member panel (server component)**

```tsx
// components/account/member-panel.tsx
import { getPendingInvites, getSpaceMembers } from "@/lib/account/queries";
import { InviteDialog } from "@/components/account/invite-dialog";
import { RevokeInviteButton } from "@/components/account/invite-dialog";
import type { SpaceRole } from "@/lib/domain/account";

export async function MemberPanel({ spaceId, actorRole, isOwner, locale }: {
  spaceId: string; actorRole: SpaceRole; isOwner: boolean; locale: "en" | "zh";
}) {
  const members = await getSpaceMembers(spaceId);
  const canManage = isOwner || actorRole === "admin";
  const invites = canManage ? await getPendingInvites(spaceId) : [];
  const roleTxt = (r: SpaceRole) => (locale === "zh" ? (r === "admin" ? "管理员" : "成员") : r);
  return (
    <section className="member-panel">
      <h2>{locale === "zh" ? "空间成员" : "Space members"}</h2>
      <ul>
        {members.map((m) => (
          <li key={m.id}>
            <span className="uavatar" style={{ background: m.profile.color }}>{m.profile.avatarChar}</span>
            <span>{m.profile.displayName}</span><span className="title">{m.title}</span>
            <span className={`role-badge ${m.role}`}>{roleTxt(m.role)}</span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <>
          <InviteDialog spaceId={spaceId} canInviteAdmin={isOwner} locale={locale} />
          <h3>{locale === "zh" ? "待处理邀请" : "Pending invites"}</h3>
          <ul>
            {invites.map((i) => (
              <li key={i.id}>{i.email} · {roleTxt(i.role)}
                <RevokeInviteButton inviteId={i.id} spaceId={spaceId} label={locale === "zh" ? "撤销" : "Revoke"} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
```

Add `RevokeInviteButton` to `invite-dialog.tsx`:
```tsx
// append to components/account/invite-dialog.tsx
"use client";
import { revokeInvite } from "@/lib/account/mutations";
export function RevokeInviteButton({ inviteId, spaceId, label }: { inviteId: string; spaceId: string; label: string }) {
  return <button onClick={async () => { await revokeInvite(inviteId, spaceId); location.reload(); }}>{label}</button>;
}
```

- [ ] **Step 3: Member pages**

```tsx
// app/space/members/page.tsx
import { redirect } from "next/navigation";
import { getMySpaces } from "@/lib/account/queries";
import { MemberPanel } from "@/components/account/member-panel";

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { space } = await searchParams;
  const mine = await getMySpaces();
  const target = mine.find((m) => m.space.id === space) ?? mine[0];
  if (!target) redirect("/no-space");
  return <main><MemberPanel spaceId={target.space.id} actorRole={target.role} isOwner={target.isOwner} locale="en" /></main>;
}
```
```tsx
// app/zh/space/members/page.tsx — same but locale="zh", redirect "/zh/no-space"
import { redirect } from "next/navigation";
import { getMySpaces } from "@/lib/account/queries";
import { MemberPanel } from "@/components/account/member-panel";
export default async function ZhMembersPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { space } = await searchParams;
  const mine = await getMySpaces();
  const target = mine.find((m) => m.space.id === space) ?? mine[0];
  if (!target) redirect("/zh/no-space");
  return <main><MemberPanel spaceId={target.space.id} actorRole={target.role} isOwner={target.isOwner} locale="zh" /></main>;
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit`; `npm run dev`, open `/space/members`, generate an invite link, confirm it appears under pending invites.
```bash
git add components/account/member-panel.tsx components/account/invite-dialog.tsx app/space app/zh/space
git commit -m "feat: add member panel and invite generation UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Invite landing page + acceptance

**Files:**
- Create: `app/invite/[token]/page.tsx`, `components/auth/invite-acceptance.tsx`

- [ ] **Step 1: Landing page (server validates token)**

```tsx
// app/invite/[token]/page.tsx
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapInviteRow } from "@/lib/account/queries";
import { evaluateInvite } from "@/lib/account/invite";
import { getSessionUser } from "@/lib/account/queries";
import { InviteAcceptance } from "@/components/auth/invite-acceptance";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from("space_invites").select("*, spaces!inner(name, theme)").eq("token", token).single();
  if (!row) return <main className="auth-page"><p>邀请不存在 / Invite not found</p></main>;
  const invite = mapInviteRow(row);
  const check = evaluateInvite(invite, new Date().toISOString());
  if (!check.ok) return <main className="auth-page"><p>邀请已{check.reason === "expired" ? "过期" : "失效"} / Invite {check.reason}</p></main>;

  const user = await getSessionUser();
  return (
    <main className="auth-page">
      <h1>邀你加入「{row.spaces.name}」</h1>
      <p>{row.spaces.theme}</p>
      <InviteAcceptance
        token={token}
        inviteEmail={invite.email}
        sessionEmail={user?.email ?? null}
        defaultName={invite.email.split("@")[0]}
      />
    </main>
  );
}
```

- [ ] **Step 2: Acceptance client (login gate + profile completion + accept)**

```tsx
// components/auth/invite-acceptance.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { acceptInvite } from "@/lib/account/mutations";

const COLORS = ["#8b5e3c", "#2d2d5e", "#1890ff", "#c0392b", "#16a085"];

export function InviteAcceptance({ token, inviteEmail, sessionEmail, defaultName }: {
  token: string; inviteEmail: string; sessionEmail: string | null; defaultName: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  const matches = sessionEmail && sessionEmail.toLowerCase() === inviteEmail.toLowerCase();

  async function sendCode() {
    const { error } = await supabase.auth.signInWithOtp({ email: inviteEmail, options: { shouldCreateUser: true } });
    if (error) setError(error.message); else setSent(true);
  }
  async function verify() {
    const { error } = await supabase.auth.verifyOtp({ email: inviteEmail, token: code, type: "email" });
    if (error) setError(error.message); else router.refresh();
  }
  async function accept() {
    setError(null);
    try {
      const { spaceId } = await acceptInvite(token, {
        displayName: name, avatarChar: name[0] ?? "·", color: COLORS[name.length % COLORS.length],
      });
      router.replace(`/?space=${spaceId}`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }

  if (!matches) {
    if (sessionEmail) return <p className="auth-error">此邀请发给 {inviteEmail}，请用该邮箱登录。</p>;
    return (
      <div className="auth-card">
        <p>用 {inviteEmail} 登录以接受邀请</p>
        {!sent ? <button onClick={sendCode}>发送验证码</button> : (
          <>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="验证码" />
            <button onClick={verify} disabled={!code}>验证</button>
          </>
        )}
        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="auth-card">
      <label>显示名 <input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button onClick={accept} disabled={!name}>接受邀请</button>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: End-to-end verification**

Run: generate an invite (Task 13) for `tester@x.com`, open the link in a private window, request a code (Inbucket `http://127.0.0.1:54324`), verify, complete the name, accept.
Expected: redirected into the space; the new member appears in the member panel; the invite row becomes `accepted`.

- [ ] **Step 4: Commit**

```bash
git add app/invite components/auth/invite-acceptance.tsx
git commit -m "feat: add invite landing and acceptance flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: Owner — create space + all-spaces overview

**Files:**
- Create: `components/account/create-space-dialog.tsx`, `app/spaces/page.tsx`, `app/zh/spaces/page.tsx`

- [ ] **Step 1: Create-space dialog**

```tsx
// components/account/create-space-dialog.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSpace } from "@/lib/account/mutations";

export function CreateSpaceDialog({ locale }: { locale: "en" | "zh" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { name: "空间名称", theme: "内容主题", admin: "管理员邮箱（指派/邀请）", create: "创建空间" }
    : { name: "Space name", theme: "Content theme", admin: "Admin email (assign/invite)", create: "Create space" };
  async function submit() {
    setError(null);
    try {
      await createSpace({ name, theme, adminEmail: adminEmail || undefined });
      router.refresh();
      setName(""); setTheme(""); setAdminEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "error"); }
  }
  return (
    <div className="create-space">
      <input value={name} placeholder={t.name} onChange={(e) => setName(e.target.value)} />
      <input value={theme} placeholder={t.theme} onChange={(e) => setTheme(e.target.value)} />
      <input type="email" value={adminEmail} placeholder={t.admin} onChange={(e) => setAdminEmail(e.target.value)} />
      <button onClick={submit} disabled={!name}>{t.create}</button>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: All-spaces overview (owner-gated)**

```tsx
// app/spaces/page.tsx
import { redirect } from "next/navigation";
import { getMySpaces, getSpaceMembers } from "@/lib/account/queries";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";

export default async function SpacesPage() {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.isOwner)) redirect("/");
  const rows = await Promise.all(mine.map(async (m) => ({ m, count: (await getSpaceMembers(m.space.id)).length })));
  return (
    <main className="spaces-overview">
      <h1>All spaces</h1>
      <ul>
        {rows.map(({ m, count }) => (
          <li key={m.space.id}>
            <a href={`/?space=${m.space.id}`}>{m.space.name}</a>
            <span>{m.space.theme}</span><span>{count} members</span>
            <a href={`/space/members?space=${m.space.id}`}>Manage</a>
          </li>
        ))}
      </ul>
      <CreateSpaceDialog locale="en" />
    </main>
  );
}
```
```tsx
// app/zh/spaces/page.tsx — same, locale="zh", labels 中文, redirect "/zh"
import { redirect } from "next/navigation";
import { getMySpaces, getSpaceMembers } from "@/lib/account/queries";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";
export default async function ZhSpacesPage() {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.isOwner)) redirect("/zh");
  const rows = await Promise.all(mine.map(async (m) => ({ m, count: (await getSpaceMembers(m.space.id)).length })));
  return (
    <main className="spaces-overview">
      <h1>全部空间</h1>
      <ul>
        {rows.map(({ m, count }) => (
          <li key={m.space.id}>
            <a href={`/zh/?space=${m.space.id}`}>{m.space.name}</a>
            <span>{m.space.theme}</span><span>{count} 名成员</span>
            <a href={`/zh/space/members?space=${m.space.id}`}>管理</a>
          </li>
        ))}
      </ul>
      <CreateSpaceDialog locale="zh" />
    </main>
  );
}
```

> **Note:** the `?space=<id>` query selects the initial space in `SpaceProvider`. Extend `SpaceProvider` (Task 10) to honor an optional `initialSpaceId` prop and have `AccountShell` read it from `searchParams` when present. If deferring, the switcher still works after load.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit`; `npm run dev`, open `/spaces` as the owner, create「聊军事」with an admin email, confirm it appears and an admin invite was created.
```bash
git add components/account/create-space-dialog.tsx app/spaces app/zh/spaces
git commit -m "feat: add owner create-space and all-spaces overview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: No-space empty state + bilingual copy module

**Files:**
- Create: `app/no-space/page.tsx`, `app/zh/no-space/page.tsx`, `lib/i18n/account-copy.ts`

- [ ] **Step 1: Bilingual copy module**

```ts
// lib/i18n/account-copy.ts
import type { Locale } from "@/lib/i18n/copy";

const dict = {
  en: { noSpaceTitle: "No space yet", noSpaceWaiting: "You're signed in but not part of any space. Ask an admin for an invite.", noSpaceOwner: "Create your first space to get started." },
  zh: { noSpaceTitle: "还没有空间", noSpaceWaiting: "你已登录，但还不属于任何空间。请向管理员索取邀请。", noSpaceOwner: "创建你的第一个空间以开始。" },
} as const;

export function getAccountCopy(locale: Locale) {
  return dict[locale];
}
```

- [ ] **Step 2: No-space pages**

```tsx
// app/no-space/page.tsx
import { getMySpaces } from "@/lib/account/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountCopy } from "@/lib/i18n/account-copy";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";

export default async function NoSpacePage() {
  const copy = getAccountCopy("en");
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: app } = await supabase.from("applications").select("id").eq("owner_id", user.user!.id).maybeSingle();
  return (
    <main className="no-space">
      <h1>{copy.noSpaceTitle}</h1>
      {app ? <><p>{copy.noSpaceOwner}</p><CreateSpaceDialog locale="en" /></> : <p>{copy.noSpaceWaiting}</p>}
    </main>
  );
}
```
```tsx
// app/zh/no-space/page.tsx — same with getAccountCopy("zh") and CreateSpaceDialog locale="zh"
import { getMySpaces } from "@/lib/account/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountCopy } from "@/lib/i18n/account-copy";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";
export default async function ZhNoSpacePage() {
  const copy = getAccountCopy("zh");
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: app } = await supabase.from("applications").select("id").eq("owner_id", user.user!.id).maybeSingle();
  return (
    <main className="no-space">
      <h1>{copy.noSpaceTitle}</h1>
      {app ? <><p>{copy.noSpaceOwner}</p><CreateSpaceDialog locale="zh" /></> : <p>{copy.noSpaceWaiting}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit`. Sign in as a user with no membership → lands on `/no-space`.
```bash
git add app/no-space app/zh/no-space lib/i18n/account-copy.ts
git commit -m "feat: add no-space empty state and account copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17: Seed script — owner + 聊太空 + 3 members

**Files:**
- Create: `scripts/seed-account.ts`
- Modify: `package.json` (add `seed:account` script)

**Context:** Supabase generates uuids for the three seeded users. `seedSpaceContent`'s `LIN_HAHA_MEMBER_MAP` is already keyed by display name (Task 6), so the seed just needs to create users whose `profiles.display_name` matches 林哈哈/周野/何远 — no id coordination required.

- [ ] **Step 1: Confirm the name-based map (no code change)**

Verify `lib/workflow/seed-space-content.ts` (Task 6) defines `LIN_HAHA_MEMBER_MAP` as fixture-id → display-name (`"u-lin": "林哈哈"`, …). The seed below produces profiles with exactly those display names, so 聊太空's content ownership resolves correctly.

- [ ] **Step 2: Write the seed script**

```ts
// scripts/seed-account.ts
import { createClient } from "@supabase/supabase-js";
import { teamMembers } from "../lib/data/phase1-fixtures";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const EMAILS: Record<string, string> = {
  "u-lin": "lin@linhaha.local",
  "u-zhou": "zhou@linhaha.local",
  "u-he": "he@linhaha.local",
};

async function main() {
  const ids: Record<string, string> = {};
  for (const m of teamMembers) {
    const { data, error } = await admin.auth.admin.createUser({ email: EMAILS[m.id], email_confirm: true });
    if (error) throw error;
    ids[m.id] = data.user!.id;
    await admin.from("profiles").upsert({ id: data.user!.id, display_name: m.name, avatar_char: m.avatarChar, color: m.color });
  }

  const owner = ids["u-lin"];
  const { data: app } = await admin.from("applications").insert({ name: "林哈哈", owner_id: owner }).select("id").single();
  const { data: space } = await admin.from("spaces").insert({ application_id: app!.id, name: "聊太空", theme: "商业航天 · 太空" }).select("id").single();

  for (const m of teamMembers) {
    await admin.from("space_members").insert({
      space_id: space!.id, user_id: ids[m.id],
      role: m.id === "u-lin" ? "admin" : "member", title: m.role,
    });
  }
  console.log("Seeded owner + 聊太空 + members:", ids);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add npm script**

In `package.json` `scripts`:
```json
"seed:account": "node --env-file=.env.local --experimental-strip-types scripts/seed-account.ts"
```

- [ ] **Step 4: Run the seed and verify**

Run:
```bash
supabase db reset
npm run seed:account
```
Expected: logs three uuids; `psql "$DATABASE_URL" -c "select name from spaces;"` shows `聊太空`; `select count(*) from space_members;` → 3.

- [ ] **Step 5: Full login smoke test**

Run: `npm run dev`, go to `/zh/login`, request a code for `lin@linhaha.local`, verify (Inbucket), land on `/zh` with 聊太空 content; member panel shows 林哈哈(管理员)/周野/何远.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-account.ts package.json lib/workflow/seed-space-content.ts lib/workflow/seed-space-content.test.ts
git commit -m "feat: add account seed script and name-based 聊太空 remap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: Setup docs

**Files:**
- Modify: `README.md` (create if absent)

- [ ] **Step 1: Document setup**

Add a section:
```markdown
## Account layer (Supabase) — local setup

1. `supabase start` — copy the printed anon + service_role keys into `.env.local` (see `.env.example`).
2. `supabase db reset` — applies `0001` + `0002` migrations.
3. `npm run seed:account` — creates owner 林哈哈 + 聊太空 space + 周野/何远.
4. `npm run dev`, open `/zh/login`, sign in with `lin@linhaha.local`. Local emails appear in Inbucket: http://127.0.0.1:54324.

**Phase boundary:** Spaces, members, and invites persist in Supabase. Per-space *content* (signals/briefs/topic cards) is still seeded from fixtures in memory and **resets on refresh** — content migration to Supabase is Phase 2.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document account-layer local setup and phase boundary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run full test suite: `npx vitest run` — all pass.
- [ ] Type-check: `npx tsc --noEmit` — no errors.
- [ ] Lint: `npm run lint` — no new errors.
- [ ] Manual: log in as owner → see 聊太空 → create 聊军事 (cloned demo content) → invite a member → accept in a private window → switch spaces in the top nav.
