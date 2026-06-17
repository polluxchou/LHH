-- 0012_brief_verification.sql
-- 把 x-search 事实核查结果与简报一起持久化,刷新后不丢(此前仅存在内存)。
-- 纯追加、可空列:当前线上代码不引用它,先于新代码部署运行即可,向后兼容。
alter table editorial_briefs
  add column if not exists verification jsonb;
