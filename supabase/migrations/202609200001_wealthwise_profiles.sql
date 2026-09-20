create table if not exists public.wealthwise_profiles (
  user_id text primary key,
  email text,
  display_name text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wealthwise_profiles enable row level security;

grant select, insert, update on table public.wealthwise_profiles to service_role;

comment on table public.wealthwise_profiles is
  'Stores the current WealthWise browser data document for optional Netlify server-side sync. Keep OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY only in Netlify environment variables.';
