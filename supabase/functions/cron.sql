-- Раз в минуту вызывает функцию send-reminders. Выполните в SQL Editor ПОСЛЕ деплоя функции.
-- 1) Database → Extensions: включите pg_cron и pg_net.
-- 2) Замените <PROJECT_REF> (из адреса https://<PROJECT_REF>.supabase.co) и <CRON_SECRET> (тот же, что в секретах функции).
select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
-- Остановить: select cron.unschedule('send-reminders');
