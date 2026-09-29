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
  context text not null default 'any' check (context in ('any','work','home')),  -- где: везде / на вахте / дома
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
  context text not null default 'any' check (context in ('any','work','home')),
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
  covers jsonb,
  shift jsonb,                  -- график вахты: {work, home, start, phase}
  notify jsonb                  -- настройки уведомлений
);

-- Входящие: быстрые мысли, которые потом разбираются
create table if not exists inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

-- Привычки (kind = habit) и уходы (kind = care)
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  emoji text,
  kind text not null default 'habit' check (kind in ('habit','care')),
  context text not null default 'any' check (context in ('any','work','home')),
  created_at timestamptz default now()
);

-- Отметки выполнения: одна на привычку в день
create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  day date not null,
  created_at timestamptz default now(),
  unique (habit_id, day)
);

-- Настроение: оценка 1–5 на день
create table if not exists moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  mood int not null check (mood between 1 and 5),
  created_at timestamptz default now()
);

-- Уведомления: подписки на push (по одной на устройство) и журнал отправленного
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create table if not exists push_sent (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table push_sent enable row level security;   -- политик нет: пишет только сервер (service role)

-- Row Level Security: каждый видит только свои данные
do $$
declare t text;
begin
  foreach t in array array['events','tasks','mind_nodes','time_blocks','activity_log','settings','inbox','habits','habit_logs','moods','push_subscriptions'] loop
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
