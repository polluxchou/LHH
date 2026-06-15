-- supabase/migrations/0004_rename_default_space.sql
-- Rename the seeded default space 聊太空 → 林哈哈聊太空 to match the product brand.
-- Idempotent: on a fresh DB (already seeded with the new name) the WHERE matches
-- nothing and this is a no-op; on an existing DB it renames the row in place so the
-- runtime demo-content match (space.name === "林哈哈聊太空") and the SpaceSwitcher label stay correct.

update spaces set name = '林哈哈聊太空' where name = '聊太空';
