-- Gather: one-company workspace. Run once in a new Supabase project.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.app_role as enum ('employee','manager','accountant');
create type public.schedule_status as enum ('draft','published','pending');
create table public.employees (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 100),
 email text not null unique check(email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 department text not null check(length(trim(department)) between 1 and 60),
 title text not null check(length(trim(title)) between 1 and 80),active boolean not null default true,
 color text not null default '#7974cf' check(color ~ '^#[0-9a-fA-F]{6}$'),
 user_id uuid unique references auth.users(id) on delete set null
);
create unique index employees_email_lower on public.employees(lower(email));
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role public.app_role not null default 'employee',employee_id uuid references public.employees(id) on delete set null
);
create table private.role_permissions (user_id uuid primary key references auth.users(id) on delete cascade,can_view_payroll boolean not null default false);
create table private.setup_codes (role public.app_role primary key,code_hash text not null,claimed_by uuid references auth.users(id),claimed_at timestamptz,attempts integer not null default 0,locked_until timestamptz);
-- These are bootstrap codes, never frontend or standalone authentication.
insert into private.setup_codes(role,code_hash) values
 ('manager',extensions.crypt('1234',extensions.gen_salt('bf',12))),
 ('accountant',extensions.crypt('5678',extensions.gen_salt('bf',12)));
create table public.company_settings (
 id text primary key default 'company' check(id='company'),name text not null check(length(trim(name)) between 1 and 80),
 timezone text not null default 'America/Los_Angeles',minimum_staff integer not null default 0 check(minimum_staff between 0 and 1000)
);
insert into public.company_settings(id,name) values ('company','Your workspace');
create table public.payroll_rules (
 id text primary key default 'company' check(id='company'),location text not null check(length(trim(location)) between 1 and 100),
 weekly_threshold numeric not null default 40 check(weekly_threshold>0 and weekly_threshold<=168),
 daily_threshold numeric not null default 0 check(daily_threshold between 0 and 24),
 double_threshold numeric not null default 0 check(double_threshold between 0 and 24),
 overtime_multiplier numeric not null default 1.5 check(overtime_multiplier between 1 and 5),
 double_multiplier numeric not null default 2 check(double_multiplier between 1 and 5),
 week_starts integer not null default 1 check(week_starts between 0 and 6),
 check(double_threshold=0 or daily_threshold=0 or double_threshold>=daily_threshold)
);
insert into public.payroll_rules(id,location) values('company','Configure your location and policy');
create table public.schedule_days(id uuid primary key default gen_random_uuid(),date date not null unique,status public.schedule_status not null default 'pending');
create table public.shifts(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id),date date not null,
 start time not null,"end" time not null,break_minutes integer not null default 0 check(break_minutes between 0 and 600),
 status public.schedule_status not null default 'draft'
);
create index shifts_date_employee on public.shifts(date,employee_id);
create table public.notes(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id),
 kind text not null check(kind in('Call-off','Late arrival','Schedule change','General')),
 body text not null check(length(trim(body)) between 3 and 3000),created_at timestamptz not null default now()
);
create table public.time_entries(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id),date date not null,
 start time not null,"end" time not null,break_minutes integer not null default 0 check(break_minutes between 0 and 600),
 adjustment_minutes integer not null default 0 check(adjustment_minutes between -480 and 480),
 adjustment_reason text not null default '' check(length(adjustment_reason)<=500),approved boolean not null default false,
 check(adjustment_minutes=0 or length(trim(adjustment_reason))>=3)
);
create index time_entries_employee_date on public.time_entries(employee_id,date);
create table public.pay_rates(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employees(id),
 hourly_rate numeric(10,2) not null check(hourly_rate>0 and hourly_rate<=10000),effective_date date not null,
 unique(employee_id,effective_date)
);
create table public.audit_log(
 id uuid primary key default gen_random_uuid(),actor text not null,entity text not null,action text not null,
 record_id text,old_value jsonb,new_value jsonb,created_at timestamptz not null default now()
);
create or replace function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid()
$$;
create or replace function private.employee_id() returns uuid language sql stable security definer set search_path='' as $$
 select p.employee_id from public.profiles p join public.employees e on e.id=p.employee_id where p.id=auth.uid() and e.active
$$;
create or replace function private.can_payroll() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.current_role()='accountant' or (private.current_role()='manager' and exists(select 1 from private.role_permissions where user_id=auth.uid() and can_view_payroll)),false)
$$;
create or replace function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,role) values(new.id,'employee');return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_user();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
create or replace function public.link_employee() returns void language plpgsql security definer set search_path='' as $$
declare matched uuid;begin
 select e.id into matched from public.employees e join auth.users u on lower(e.email)=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null and e.active;
 if matched is not null then
 update public.profiles set employee_id=matched where id=auth.uid() and role='employee';
 update public.employees set user_id=auth.uid() where id=matched and (user_id is null or user_id=auth.uid());
 end if;
end $$;
-- Enrollment is callable only with the server's service-role client.
create or replace function public.bootstrap_role(p_user uuid,p_role text,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare found_code private.setup_codes%rowtype;begin
 if p_role not in('manager','accountant') then raise exception 'Invalid role';end if;
 select * into found_code from private.setup_codes where role=p_role::public.app_role for update;
 if found_code.claimed_by is not null then raise exception 'Role already enrolled';end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Verified account required';end if;
 if found_code.code_hash<>extensions.crypt(p_code,found_code.code_hash) then raise exception 'Invalid code';end if;
 update public.profiles set role=p_role::public.app_role,employee_id=null where id=p_user and role='employee';
 if not found then raise exception 'User already holds a role';end if;
 update private.setup_codes set claimed_by=p_user,claimed_at=now() where role=p_role::public.app_role;
 insert into public.audit_log(actor,entity,action,record_id) values(p_user::text,'profiles','Enrolled '||p_role,p_user::text);
end $$;
revoke all on function public.bootstrap_role(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_role(uuid,text,text) to service_role;
create or replace function public.change_access_code(p_current text,p_new text) returns void language plpgsql security definer set search_path='' as $$
declare r public.app_role;v private.setup_codes%rowtype;begin
 r:=private.current_role();
 if r not in('manager','accountant') or length(p_new)<8 or length(p_new)>128 then raise exception 'Not permitted or code too short';end if;
 select * into v from private.setup_codes where role=r for update;
 if v.claimed_by<>auth.uid() then raise exception 'Only initial role owner can rotate this setup code';end if;
 if v.code_hash<>extensions.crypt(p_current,v.code_hash) then raise exception 'Current code incorrect';end if;
 update private.setup_codes set code_hash=extensions.crypt(p_new,extensions.gen_salt('bf',12)) where role=r;
 insert into public.audit_log(actor,entity,action) values(auth.uid()::text,'profiles','Rotated access code');
end $$;
create or replace function private.record_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(actor,entity,action,record_id,old_value,new_value)
 values(coalesce(auth.uid()::text,'administrator'),tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id'),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
-- Reject nonexistent and ambiguous local wall times rather than silently changing them.
create or replace function private.valid_walltime(t timestamp,z text) returns boolean language sql stable set search_path='' as $$
 select (t at time zone z) at time zone z=t and not exists(
 select 1 from generate_series(-120,120) m where m<>0 and (((t at time zone z)+m*interval '1 minute') at time zone z)=t)
$$;
create or replace function private.validate_time() returns trigger language plpgsql security definer set search_path='' as $$
declare z text;a timestamp;b timestamp;elapsed numeric;other record;oa timestamptz;ob timestamptz;begin
 select timezone into z from public.company_settings where id='company';
 a:=new.date+new.start;b:=new.date+new."end"+case when new."end"<=new.start then interval '1 day' else interval '0' end;
 if not private.valid_walltime(a,z) or not private.valid_walltime(b,z) then raise exception 'Ambiguous or nonexistent local time';end if;
 elapsed:=extract(epoch from ((b at time zone z)-(a at time zone z)))/60;
 if elapsed<=0 or elapsed>1500 or new.break_minutes>=elapsed then raise exception 'Invalid duration or unpaid break';end if;
 if tg_table_name='shifts' and not exists(select 1 from public.employees where id=new.employee_id and active) then
 if tg_op='INSERT' or new.employee_id is distinct from old.employee_id or new.date is distinct from old.date or new.start is distinct from old.start or new."end" is distinct from old."end" then raise exception 'Employee is inactive';end if;
 end if;
 if tg_table_name='time_entries' then
 if elapsed-new.break_minutes+new.adjustment_minutes<0 then raise exception 'Adjustment exceeds worked hours';end if;
 -- Serialize entries for the employee, preventing concurrent overlapping payroll records.
 perform pg_advisory_xact_lock(hashtextextended(new.employee_id::text,0));
 for other in select * from public.time_entries where employee_id=new.employee_id and id<>new.id and date between new.date-1 and new.date+1 loop
 oa:=(other.date+other.start) at time zone z;
 ob:=(other.date+other."end"+case when other."end"<=other.start then interval '1 day' else interval '0' end) at time zone z;
 if (a at time zone z)<ob and oa<(b at time zone z) then raise exception 'Actual time entries cannot overlap';end if;
 end loop;
 end if;return new;end $$;
create trigger shifts_validate before insert or update on public.shifts for each row execute function private.validate_time();
create trigger time_entries_validate before insert or update on public.time_entries for each row execute function private.validate_time();
create or replace function private.validate_timezone() returns trigger language plpgsql set search_path='' as $$
begin if tg_op='UPDATE' and new.timezone is distinct from old.timezone and exists(select 1 from public.time_entries) then raise exception 'Company timezone is locked after actual time entries exist';end if;
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Unknown timezone';end if;return new;end $$;
create trigger settings_timezone before insert or update on public.company_settings for each row execute function private.validate_timezone();
-- Editing a shift unpublishes its affected dates until the manager republishes.
create or replace function private.mark_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('gather.publishing',true)='true' then return coalesce(new,old);end if;
 if tg_op<>'DELETE' then
 insert into public.schedule_days(date,status) values(new.date,'draft') on conflict(date) do update set status='draft';
 end if;
 if tg_op<>'INSERT' then
 insert into public.schedule_days(date,status) values(old.date,'draft') on conflict(date) do update set status='draft';
 end if;
 return coalesce(new,old);
end $$;
create trigger shifts_draft after insert or update or delete on public.shifts for each row execute function private.mark_draft();
create or replace function public.publish_schedule(p_from date,p_to date) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() is distinct from 'manager' or p_to<p_from or p_to-p_from>366 then raise exception 'Invalid range or permission';end if;
 perform set_config('gather.publishing','true',true);
 update public.shifts set status='published' where date between p_from and p_to;
 insert into public.schedule_days(date,status) select d::date,'published' from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d on conflict(date) do update set status='published';
 perform set_config('gather.publishing','false',true);
end $$;
create or replace function public.duplicate_week(p_from date,p_target date) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() is distinct from 'manager' or (p_target<=p_from+6 and p_target+6>=p_from) then raise exception 'Invalid target week or permission';end if;
 insert into public.shifts(employee_id,date,start,"end",break_minutes,status)
 select s.employee_id,s.date+(p_target-p_from),s.start,s."end",s.break_minutes,'draft' from public.shifts s join public.employees e on e.id=s.employee_id where s.date between p_from and p_from+6 and e.active;
end $$;
do $$ declare t text;begin
 foreach t in array array['employees','shifts','schedule_days','notes','time_entries','pay_rates','company_settings','payroll_rules'] loop
 execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.record_audit()',t);
 end loop;
end $$;
create or replace function public.set_schedule_status(p_from date,p_to date,p_status public.schedule_status) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.current_role() is distinct from 'manager' or p_to<p_from or p_to-p_from>366 or p_status is null then raise exception 'Invalid range, status, or permission';end if;
 perform set_config('gather.publishing','true',true);
 update public.shifts set status=p_status where date between p_from and p_to;
 insert into public.schedule_days(date,status) select d::date,p_status from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d on conflict(date) do update set status=excluded.status;
 perform set_config('gather.publishing','false',true);
end $$;
revoke execute on function public.set_schedule_status(date,date,public.schedule_status) from public,anon;
grant execute on function public.set_schedule_status(date,date,public.schedule_status) to authenticated;
-- RLS: each table is private by default; anonymous clients have no table grants.
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.shifts enable row level security;
alter table public.schedule_days enable row level security;
alter table public.notes enable row level security;
alter table public.time_entries enable row level security;
alter table public.pay_rates enable row level security;
alter table public.company_settings enable row level security;
alter table public.payroll_rules enable row level security;
alter table public.audit_log enable row level security;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy employees_read on public.employees for select to authenticated using(private.current_role() in('manager','accountant') or id=private.employee_id());
create policy employees_insert on public.employees for insert to authenticated with check(private.current_role()='manager');
create policy employees_update on public.employees for update to authenticated using(private.current_role()='manager') with check(private.current_role()='manager');
create policy shifts_read on public.shifts for select to authenticated using(private.current_role()='manager' or (employee_id=private.employee_id() and status='published' and exists(select 1 from public.schedule_days sd where sd.date=shifts.date and sd.status='published')));
create policy shifts_manage on public.shifts for all to authenticated using(private.current_role()='manager') with check(private.current_role()='manager');
create policy days_read on public.schedule_days for select to authenticated using(private.current_role()='manager' or (private.current_role()='employee' and private.employee_id() is not null and status='published'));
create policy days_manage on public.schedule_days for all to authenticated using(private.current_role()='manager') with check(private.current_role()='manager');
create policy notes_manage on public.notes for all to authenticated using(private.current_role()='manager') with check(private.current_role()='manager');
create policy entries_manage on public.time_entries for all to authenticated using(private.current_role() in('manager','accountant')) with check(private.current_role() in('manager','accountant'));
create policy rates_read on public.pay_rates for select to authenticated using(private.can_payroll());
create policy rates_insert on public.pay_rates for insert to authenticated with check(private.current_role()='accountant');
create policy rates_update on public.pay_rates for update to authenticated using(private.current_role()='accountant') with check(private.current_role()='accountant');
create policy settings_read on public.company_settings for select to authenticated using(auth.uid() is not null);
create policy settings_manage on public.company_settings for update to authenticated using(private.current_role()='manager') with check(private.current_role()='manager');
create policy rules_read on public.payroll_rules for select to authenticated using(private.can_payroll());
create policy rules_manage on public.payroll_rules for update to authenticated using(private.current_role()='accountant') with check(private.current_role()='accountant');
create policy audit_read on public.audit_log for select to authenticated using(
 (private.current_role()='manager' and entity not in('pay_rates','payroll_rules')) or
 (private.current_role()='accountant' and entity in('pay_rates','payroll_rules','time_entries')) or
 (private.can_payroll() and entity in('pay_rates','payroll_rules'))
);
revoke all on public.profiles,public.employees,public.shifts,public.schedule_days,public.notes,public.time_entries,public.pay_rates,public.company_settings,public.payroll_rules,public.audit_log from anon;
grant select on public.profiles,public.audit_log to authenticated;
grant select,insert,update on public.employees,public.pay_rates to authenticated;
grant select,insert,update,delete on public.shifts,public.schedule_days,public.notes,public.time_entries to authenticated;
grant select,update on public.company_settings,public.payroll_rules to authenticated;
revoke insert,update,delete on public.profiles,public.audit_log from authenticated;
revoke all on all tables in schema private from authenticated,anon;
revoke execute on all functions in schema private from public,anon;
grant execute on function private.current_role(),private.employee_id(),private.can_payroll() to authenticated;
revoke execute on function public.link_employee(),public.change_access_code(text,text),public.publish_schedule(date,date),public.duplicate_week(date,date) from public,anon;
grant execute on function public.link_employee(),public.change_access_code(text,text),public.publish_schedule(date,date),public.duplicate_week(date,date) to authenticated;
-- Realtime follows each subscriber's RLS. Polling is also provided by the client.
do $$ declare t text;begin
 foreach t in array array['employees','shifts','schedule_days','time_entries','pay_rates','notes','company_settings','payroll_rules'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t);
 end if;end loop;end $$;
commit;
