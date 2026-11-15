begin;
create schema if not exists wealthwise_private;
revoke all on schema wealthwise_private from public, anon, authenticated;
create table if not exists wealthwise_private.geojit_statements (
gmail_message_id text primary key, statement_date date not null,
holdings jsonb not null, total_inr numeric(18,2) not null,
imported_at timestamptz not null default now()
);
alter table wealthwise_private.geojit_statements enable row level security;
revoke all on wealthwise_private.geojit_statements from public,anon,authenticated;
revoke all on public.wealthwise_profiles from anon,authenticated;
grant select,insert,update on public.wealthwise_profiles to authenticated;
drop policy if exists "Profile owner can read" on public.wealthwise_profiles;
drop policy if exists "Profile owner can insert" on public.wealthwise_profiles;
drop policy if exists "Profile owner can update" on public.wealthwise_profiles;
create policy "Profile owner can read" on public.wealthwise_profiles for select to authenticated using (user_id = (select auth.uid())::text);
create policy "Profile owner can insert" on public.wealthwise_profiles for insert to authenticated with check (user_id = (select auth.uid())::text);
create policy "Profile owner can update" on public.wealthwise_profiles for update to authenticated using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
alter table public.wealthwise_profiles add column if not exists revision bigint not null default 1;
alter table wealthwise_private.geojit_statements add column if not exists owner_email text;
create or replace function public.wealthwise_load_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text; profile public.wealthwise_profiles; stocks jsonb;
begin
if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
select lower(email) into mail from auth.users where id=uid and email_confirmed_at is not null;
if mail is null then raise exception 'Verify your email' using errcode='42501'; end if;
select p.* into profile from public.wealthwise_profiles p where p.user_id=uid::text;
if not found then
 select jsonb_agg(jsonb_build_object('isin',s->>'isin','name',s->>'name','sym',s->>'isin','qty',s->'qty','ltp',s->'ltp','statementValue',s->'value','avg',null,'cur','INR','exch','Geojit','note','Imported from Geojit statement dated '||g.statement_date::text))
 into stocks from (select * from wealthwise_private.geojit_statements where owner_email=mail order by statement_date desc limit 1) g cross join lateral jsonb_array_elements(g.holdings) s;
 insert into public.wealthwise_profiles(user_id,email,data) values(uid::text,mail,jsonb_build_object('stocks',coalesce(stocks,'[]'::jsonb),'mf','[]'::jsonb,'crypto','[]'::jsonb,'otherInv','[]'::jsonb,'banks','[]'::jsonb,'fds','[]'::jsonb,'loans','[]'::jsonb,'cards','[]'::jsonb,'expenses','[]'::jsonb,'settings',jsonb_build_object('baseCur','INR')))
 on conflict(user_id) do nothing;
 select p.* into profile from public.wealthwise_profiles p where p.user_id=uid::text;
end if;
return jsonb_build_object('data',profile.data,'revision',profile.revision);
end $$;
create or replace function public.wealthwise_save_profile(profile_data jsonb, expected_revision bigint)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_revision bigint;
begin
if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
if jsonb_typeof(profile_data)<>'object' then raise exception 'Invalid profile'; end if;
update public.wealthwise_profiles set data=profile_data,revision=revision+1,updated_at=now()
where user_id=auth.uid()::text and revision=expected_revision returning revision into next_revision;
if next_revision is null then raise exception 'Profile changed in another session. Reload before saving.' using errcode='40001'; end if;
return next_revision;
end $$;
revoke all on function public.wealthwise_load_profile() from public,anon;
revoke all on function public.wealthwise_save_profile(jsonb,bigint) from public,anon;
grant execute on function public.wealthwise_load_profile() to authenticated;
grant execute on function public.wealthwise_save_profile(jsonb,bigint) to authenticated;
commit;