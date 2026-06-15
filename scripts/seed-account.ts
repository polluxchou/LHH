import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Self-contained seed data (mirrors lib/data/phase1-fixtures teamMembers).
// seedSpaceContent resolves 林哈哈聊太空 content ownership by display name, so ids are not needed here.
const SEED_MEMBERS = [
  { email: "lin@linhaha.local", displayName: "林哈哈", avatarChar: "林", color: "#8b5e3c", title: "主编 · 主笔", role: "admin" as const },
  { email: "zhou@linhaha.local", displayName: "周野", avatarChar: "周", color: "#2d2d5e", title: "制片 · 视频策划", role: "member" as const },
  { email: "he@linhaha.local", displayName: "何远", avatarChar: "何", color: "#1890ff", title: "研究员", role: "member" as const },
];

async function findUserByEmail(email: string): Promise<User | null> {
  // listUsers is paginated; this project is tiny, one page suffices.
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!error && data.user) return data.user.id;
  // already exists → reuse
  const existing = await findUserByEmail(email);
  if (existing) return existing.id;
  throw new Error(`cannot create or find user ${email}: ${error?.message}`);
}

async function main() {
  const ids: Record<string, string> = {};
  for (const m of SEED_MEMBERS) {
    ids[m.email] = await ensureUser(m.email);
    await admin.from("profiles").upsert({
      id: ids[m.email], display_name: m.displayName, avatar_char: m.avatarChar, color: m.color,
    });
  }

  const owner = ids["lin@linhaha.local"];

  // application (idempotent: reuse the owner's existing app if present)
  let appId: string;
  const { data: existingApp } = await admin.from("applications").select("id").eq("owner_id", owner).maybeSingle();
  if (existingApp) {
    appId = existingApp.id;
  } else {
    const { data, error } = await admin.from("applications").insert({ name: "林哈哈", owner_id: owner }).select("id").single();
    if (error) throw new Error(`application insert: ${error.message}`);
    appId = data.id;
  }

  // space 林哈哈聊太空 (idempotent by name within the app)
  let spaceId: string;
  const { data: existingSpace } = await admin.from("spaces").select("id").eq("application_id", appId).eq("name", "林哈哈聊太空").maybeSingle();
  if (existingSpace) {
    spaceId = existingSpace.id;
  } else {
    const { data, error } = await admin.from("spaces").insert({ application_id: appId, name: "林哈哈聊太空", theme: "商业航天 · 太空" }).select("id").single();
    if (error) throw new Error(`space insert: ${error.message}`);
    spaceId = data.id;
  }

  // members (idempotent upsert on (space_id, user_id))
  for (const m of SEED_MEMBERS) {
    const { error } = await admin.from("space_members").upsert(
      { space_id: spaceId, user_id: ids[m.email], role: m.role, title: m.title },
      { onConflict: "space_id,user_id" },
    );
    if (error) throw new Error(`member upsert ${m.displayName}: ${error.message}`);
  }

  console.log("✅ Seeded:");
  console.log("   application 林哈哈:", appId);
  console.log("   space 林哈哈聊太空:", spaceId);
  console.log("   owner/admin 林哈哈:", owner);
  console.log("   members:", SEED_MEMBERS.map((m) => `${m.displayName}<${m.email}>`).join(", "));
}

main().then(() => process.exit(0)).catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });
