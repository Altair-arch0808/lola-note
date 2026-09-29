-- Версия 2: график вахты, метки «на вахте / дома», входящие, привычки и уходы, настроение.
-- Выполните целиком в Supabase → SQL Editor ДО деплоя новой версии сайта. Можно запускать повторно.

-- График вахты хранится в настройках пользователя
alter table settings add column if not exists shift jsonb;

-- Метка «где»: any — везде, work — на вахте, home — дома
alter table tasks       add column if not exists context text not null default 'any' check (context in ('any','work','home'));
alter table time_blocks add column if not exists context text not null default 'any' check (context in ('any','work','home'));

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

-- Row Level Security: каждый видит только свои данные
do $$
declare t text;
begin
  foreach t in array array['inbox','habits','habit_logs','moods'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
