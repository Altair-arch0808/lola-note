-- Запустите в Supabase → SQL Editor (можно повторно, ничего не сломает).
-- Гарантирует: каждая строка принадлежит своему логину, чужие строки не видны и не меняются.

do $$
declare t text;
begin
  foreach t in array array['events','tasks','mind_nodes','time_blocks','activity_log','settings'] loop
    -- на случай старой схемы без владельца
    execute format('alter table %I add column if not exists user_id uuid default auth.uid() references auth.users on delete cascade', t);
    execute format('alter table %I alter column user_id set default auth.uid()', t);
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    -- анонимные (не вошедшие) запросы не должны иметь доступа вообще
    execute format('revoke all on table %I from anon', t);
  end loop;
end $$;

-- ВАЖНО: строки, созданные раньше без владельца (user_id is null), после этого никому не видны.
-- Проверить:   select 'tasks', count(*) from tasks where user_id is null;   (и так же для остальных таблиц)
-- Закрепить за собой: update tasks set user_id = '<ваш uuid из Authentication → Users>' where user_id is null;
