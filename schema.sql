-- Выполните целиком в Supabase → SQL Editor
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  color text default '#F9C6D4',
  image_url text,
  created_at timestamptz default now()
);
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  note text,
  due_at timestamptz,
  done boolean default false,
  done_at timestamptz,
  repeat text default 'none' check (repeat in ('none','daily','weekly')),
  repeat_until date,            -- null + repeat<>'none' = бессрочно
  image_url text,
  created_at timestamptz default now()
);
create table if not exists mind_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references mind_nodes(id) on delete cascade,
  title text not null,
  body text,
  x double precision default 0,
  y double precision default 0,
  color text default '#D9CCF5',
  image_url text,
  created_at timestamptz default now()
);
create table if not exists time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  day date not null,
  start_min int not null,
  duration_min int not null default 60,
  color text default '#C9EFD9',
  created_at timestamptz default now()
);
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  action text not null,        -- created | updated | completed | deleted
  entity text not null,
  title text,
  created_at timestamptz default now()
);
create table if not exists settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  bg jsonb,
  covers jsonb
);

-- Row Level Security: каждый видит только свои данные
do $$
declare t text;
begin
  foreach t in array array['events','tasks','mind_nodes','time_blocks','activity_log','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Хранилище картинок
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
drop policy if exists "media upload" on storage.objects;
create policy "media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media delete" on storage.objects;
create policy "media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
