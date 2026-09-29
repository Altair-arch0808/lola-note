-- ============================================================================
-- fix_database.sql — ОДИН файл вместо schema.sql + всех migration_*.sql.
-- Supabase → SQL Editor → вставить целиком → Run. Можно запускать сколько угодно раз:
-- создаёт недостающие таблицы и колонки (в т.ч. dx/dy для ментальной карты), права, RLS и обновляет кэш API.
-- ============================================================================

-- ---------- таблицы ----------
create table if not exists events      (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, starts_at timestamptz not null, created_at timestamptz default now());
create table if not exists tasks       (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, created_at timestamptz default now());
create table if not exists mind_nodes  (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, created_at timestamptz default now());
create table if not exists time_blocks (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, day date not null, start_min int not null, created_at timestamptz default now());
create table if not exists activity_log(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, action text not null, entity text not null, created_at timestamptz default now());
create table if not exists settings    (user_id uuid primary key default auth.uid() references auth.users on delete cascade);
create table if not exists inbox       (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, text text not null, created_at timestamptz default now());
create table if not exists habits      (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, title text not null, created_at timestamptz default now());
create table if not exists habit_logs  (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, habit_id uuid not null references habits(id) on delete cascade, day date not null, created_at timestamptz default now(), unique (habit_id, day));
create table if not exists moods       (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, day date not null, mood int not null check (mood between 1 and 5), created_at timestamptz default now());
create table if not exists push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, endpoint text not null unique, p256dh text not null, auth text not null, created_at timestamptz default now());
create table if not exists push_sent   (user_id uuid not null references auth.users on delete cascade, key text not null, sent_at timestamptz not null default now(), primary key (user_id, key));

-- ---------- колонки (добавляются, только если их ещё нет) ----------
alter table events      add column if not exists color text default '#F9C6D4';
alter table events      add column if not exists image_url text;

alter table tasks       add column if not exists note text;
alter table tasks       add column if not exists due_at timestamptz;
alter table tasks       add column if not exists done boolean default false;
alter table tasks       add column if not exists done_at timestamptz;
alter table tasks       add column if not exists repeat text default 'none';
alter table tasks       add column if not exists repeat_until date;
alter table tasks       add column if not exists context text not null default 'any';
alter table tasks       add column if not exists image_url text;

alter table mind_nodes  add column if not exists parent_id uuid references mind_nodes(id) on delete cascade;
alter table mind_nodes  add column if not exists body text;
alter table mind_nodes  add column if not exists x double precision default 0;
alter table mind_nodes  add column if not exists y double precision default 0;
alter table mind_nodes  add column if not exists dx double precision not null default 0;   -- ручное перемещение узлов
alter table mind_nodes  add column if not exists dy double precision not null default 0;
alter table mind_nodes  add column if not exists color text default '#D9CCF5';
alter table mind_nodes  add column if not exists image_url text;

alter table time_blocks add column if not exists duration_min int not null default 60;
alter table time_blocks add column if not exists color text default '#C9EFD9';
alter table time_blocks add column if not exists context text not null default 'any';

alter table activity_log add column if not exists title text;

alter table settings    add column if not exists bg jsonb;
alter table settings    add column if not exists covers jsonb;
alter table settings    add column if not exists shift jsonb;
alter table settings    add column if not exists notify jsonb;

alter table habits      add column if not exists emoji text;
alter table habits      add column if not exists kind text not null default 'habit';
alter table habits      add column if not exists context text not null default 'any';

-- ---------- права и защита: каждый видит только свои строки ----------
grant usage on schema public to authenticated;
do $$
declare t text;
begin
  foreach t in array array['events','tasks','mind_nodes','time_blocks','activity_log','settings','inbox','habits','habit_logs','moods','push_subscriptions'] loop
    execute format('alter table %I alter column user_id set default auth.uid()', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
    execute format('revoke all on table %I from anon', t);
  end loop;
end $$;
alter table push_sent enable row level security;   -- политик нет: пишет только сервер

-- ---------- хранилище картинок ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
drop policy if exists "media upload" on storage.objects;
create policy "media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media delete" on storage.objects;
create policy "media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- аккаунты, застрявшие на «подтвердите почту», подтверждаем сразу ----------
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- ---------- обновить кэш схемы API, чтобы новые колонки сразу заработали ----------
notify pgrst, 'reload schema';
