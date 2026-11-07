-- Safe additive migration. Run after 001_workspace.sql. No records are deleted.
begin;
create or replace function private.bump_revision() returns trigger
language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1;return new;end $$;
do $$ declare t text;begin
 foreach t in array array['employees','shifts','schedule_days','notes','time_entries','pay_rates','company_settings','payroll_rules'] loop
 execute format('alter table public.%I add column if not exists revision bigint not null default 0',t);
 execute format('drop trigger if exists revision_guard on public.%I',t);
 execute format('create trigger revision_guard before update on public.%I for each row execute function private.bump_revision()',t);
 end loop;
end $$;
revoke execute on function private.bump_revision() from public,anon,authenticated;
commit;
