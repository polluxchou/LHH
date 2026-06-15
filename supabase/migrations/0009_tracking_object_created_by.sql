-- supabase/migrations/0009_tracking_object_created_by.sql
-- Record who added a tracking object so users can delete the ones they created.
-- Existing rows (seeded demo/team data migrated before this column) stay NULL and are
-- therefore never user-deletable. Writes go through the service-role client (the delete
-- server action checks creator/admin/owner); the column is readable by space members via
-- the existing member/owner SELECT policy, so no RLS change is needed here.
-- `on delete set null`: removing a user must not cascade-delete the space's tracking objects.

alter table tracking_objects
  add column if not exists created_by uuid references auth.users(id) on delete set null;
