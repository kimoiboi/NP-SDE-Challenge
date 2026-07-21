create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority    text default 'normal'
              check (priority in ('low', 'normal', 'high')),
  due_date    date,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on tasks (user_id);

alter table tasks enable row level security;

drop policy if exists "Users can manage their own tasks" on tasks;
create policy "Users can manage their own tasks"
  on tasks
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in ('created', 'moved')),
  detail     text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_id_idx on task_activity (task_id);

alter table task_activity enable row level security;

drop policy if exists "Users can view their own activity" on task_activity;
create policy "Users can view their own activity"
  on task_activity
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function pretty_status(s text)
returns text
language sql
immutable
as $$
  select case s
    when 'todo'        then 'To Do'
    when 'in_progress' then 'In Progress'
    when 'in_review'   then 'In Review'
    when 'done'        then 'Done'
    else initcap(replace(s, '_', ' '))
  end;
$$;

create or replace function log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into task_activity (task_id, user_id, action, detail)
    values (new.id, new.user_id, 'created', 'Task created');

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into task_activity (task_id, user_id, action, detail)
    values (
      new.id,
      new.user_id,
      'moved',
      'Moved from ' || pretty_status(old.status) || ' → ' || pretty_status(new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_task_activity on tasks;
create trigger trg_log_task_activity
after insert or update on tasks
for each row
execute function log_task_activity();
