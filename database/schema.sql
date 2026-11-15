-- Run in a NEW Supabase development project. Do not apply to legacy WealthWise.
begin;
create table public.ww_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(data)='object')
);
alter table public.ww_workspaces enable row level security;
revoke all on public.ww_workspaces from anon,authenticated;
grant select on public.ww_workspaces to authenticated;
create policy own_workspace on public.ww_workspaces for select to authenticated using(user_id=(select auth.uid()));
grant all on public.ww_workspaces to service_role;

create table public.ww_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_token text not null,
 email text not null,
 last_sync timestamptz,
 last_error text,
 lease_until timestamptz,
 page_token text
);
alter table public.ww_connections enable row level security;
revoke all on public.ww_connections from anon,authenticated;
grant all on public.ww_connections to service_role;
create table public.ww_oauth_states (
 state_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 verifier text not null,
 expires_at timestamptz not null
);
alter table public.ww_oauth_states enable row level security;
revoke all on public.ww_oauth_states from anon,authenticated;
grant all on public.ww_oauth_states to service_role;
create table public.ww_rate_limits (
 key text primary key,
 count integer not null default 1,
 expires_at timestamptz not null
);
alter table public.ww_rate_limits enable row level security;
revoke all on public.ww_rate_limits from anon,authenticated;
grant all on public.ww_rate_limits to service_role;
create function public.ww_rate_limit(bucket text, maximum integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.ww_rate_limits(key,count,expires_at) values(bucket,1,now()+interval '1 hour')
 on conflict(key) do update set count=case when ww_rate_limits.expires_at<now() then 1 else ww_rate_limits.count+1 end,
 expires_at=case when ww_rate_limits.expires_at<now() then now()+interval '1 hour' else ww_rate_limits.expires_at end returning count into n;
 return n<=maximum;
end $$;
revoke all on function public.ww_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.ww_rate_limit(text,integer) to service_role;
commit;
