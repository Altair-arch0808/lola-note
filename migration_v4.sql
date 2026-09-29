-- migration_v4: ручное перемещение узлов ментальной карты
-- dx/dy — смещение узла относительно автоматической раскладки
alter table mind_nodes add column if not exists dx float8 not null default 0;
alter table mind_nodes add column if not exists dy float8 not null default 0;

-- обновить кэш схемы PostgREST, чтобы колонки сразу стали видны API
NOTIFY pgrst, 'reload schema';
