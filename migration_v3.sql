-- Версия 3: уведомления. Выполните целиком в Supabase → SQL Editor (можно повторно).

-- Настройки уведомлений хранятся вместе с остальными настройками пользователя
alter table settings add column if not exists notify jsonb;

-- Подписки на push: по одной на устройство (браузер)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Что уже отправлено (чтобы напоминание пришло один раз). Пишет только сервер (service role), поэтому политик нет.
create table if not exists push_sent (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table push_subscriptions enable row level security;
drop policy if exists "own rows" on push_subscriptions;
create policy "own rows" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table push_sent enable row level security;
