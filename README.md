# Мой планер (React + Tailwind + Supabase)

Пастельный персональный планер: календарь с обратным отсчётом, задачи (повторы, метки времени), ментальная карта (в центре «Я», категории и подразделы вокруг, у каждого узла — блокнот-тетрадь с рукописным шрифтом и карточками из ссылок/картинок), расписание день/неделя/месяц с drag-and-drop, журнал активности и аналитика, картинки, свой фон и обложки вкладок.

## 1. Supabase
1. Создайте проект на supabase.com.
2. **SQL Editor** → вставьте содержимое `schema.sql` → Run (создаст таблицы, защиту RLS и хранилище `media`).
3. **Project Settings → API** — скопируйте `Project URL` и `anon public key`.
4. (по желанию) **Authentication → Providers → Email** — отключите «Confirm email», чтобы входить сразу после регистрации.

### Данные привязаны к логину
Каждая строка хранит `user_id`, а Row Level Security в `schema.sql` не даёт видеть и менять чужое. Если база создавалась по старой версии схемы — один раз выполните `migration_user_isolation.sql` (там же подсказка, как закрепить старые записи за собой).

## 2. GitHub
Распакуйте архив, содержимое должно лежать в корне репозитория (рядом `package.json`, `render.yaml`):
```
git init && git add . && git commit -m "init"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 3. Render
- **New → Blueprint** и выберите репозиторий (подхватит `render.yaml`), либо **New → Static Site**:
  Build Command `npm install && npm run build`, Publish Directory `dist`.
- В Environment добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.
- Deploy. Ключи подставляются при сборке — после их изменения нужен новый деплой.

## Локально
```
cp .env.example .env   # впишите ключи
npm install && npm run dev
```
