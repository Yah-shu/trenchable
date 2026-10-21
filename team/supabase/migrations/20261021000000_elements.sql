-- ═══════════════════════════════════════════════════════════════════════════
-- Elements (team-wide saved characters, products, locations and styles)
-- and the credits Kie actually charged per job.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Elements ──────────────────────────────────────────────────────────────
create table if not exists public.elements (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('character', 'product', 'location', 'style')),
  notes text,
  image_urls text[] not null check (cardinality(image_urls) between 1 and 12),   -- public URLs in our storage
  cover_index int not null default 0,
  created_by uuid references public.profiles not null default auth.uid(),       -- no cascade, like generations
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint elements_cover_in_range check (cover_index >= 0 and cover_index < cardinality(image_urls))
);

create index if not exists elements_created_at_idx on public.elements (created_at desc);

-- Keep updated_at current on every change, whoever makes it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists elements_touch_updated_at on public.elements;
create trigger elements_touch_updated_at
  before update on public.elements
  for each row execute function public.touch_updated_at();

-- ─── Row Level Security ────────────────────────────────────────────────────
-- The API writes with the service role and checks the same rules itself; these cover direct clients.
alter table public.elements enable row level security;

drop policy if exists "elements read" on public.elements;
drop policy if exists "elements insert own" on public.elements;
drop policy if exists "elements owner update" on public.elements;
drop policy if exists "elements owner delete" on public.elements;

-- Everyone signed in can see and use the team's elements.
create policy "elements read" on public.elements
  for select to authenticated using (true);
-- New elements always belong to the person creating them.
create policy "elements insert own" on public.elements
  for insert to authenticated with check (created_by = auth.uid());
-- Only the creator or an admin can change or delete one.
create policy "elements owner update" on public.elements
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy "elements owner delete" on public.elements
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());
-- Who made an element can't be rewritten by clients.
revoke update on public.elements from authenticated;
grant update (name, kind, notes, image_urls, cover_index) on public.elements to authenticated;

-- ─── Credits Kie charged per job ──────────────────────────────────────────
-- Filled from Kie's `creditsConsumed` when a job finishes; null for other providers.
alter table public.generations add column if not exists actual_credits numeric(12,3);
