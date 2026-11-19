-- Carnet AFYA : base Supabase (projet carnet-afya, région Zurich).
-- À coller une fois dans Supabase, SQL Editor, puis Run. Rejouable sans risque : rien n'est effacé.
--
-- Principes :
--  - aucune identité de patiente : chaque fiche n'est connue que par son code (ETH-2024-01-P001) ;
--  - lecture directe depuis le navigateur, limitée par les règles d'accès (RLS) :
--      participant : ses propres fiches ; formateur ou administrateur : toutes ;
--  - écriture des fiches et gestion des comptes uniquement par la fonction carnet-api, qui
--    vérifie chaque champ (aucune écriture directe depuis le navigateur).

-- ── Comptes ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  sections text[] not null default '{}' check (sections <@ array['participant', 'formateur']::text[]),
  is_admin boolean not null default false,
  disabled boolean not null default false,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un compte créé dans Supabase (tableau de bord ou fonction) reçoit aussitôt son profil.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profils des comptes déjà présents (créés avant ce script).
insert into public.profiles (id, email, display_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'display_name', '') from auth.users u
on conflict (id) do nothing;

-- ── Carnet ─────────────────────────────────────────────────────────────────

create table if not exists public.participants (
  id text primary key,                       -- identifiant AFYA, ex. « AFYA / ETH / 2024 / 01 »
  name text not null,
  country text not null,
  site text not null default '',
  user_id uuid unique references public.profiles (id) on delete set null
);

create table if not exists public.patients (
  code text primary key,                     -- ex. ETH-2024-01-P001
  participant_id text not null references public.participants (id),
  data jsonb not null check (octet_length(data::text) < 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index if not exists patients_participant on public.patients (participant_id);

-- Journal : connexions au carnet, fiches créées ou modifiées, actions d'administration.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  kind text not null,
  detail text
);

-- ── Qui suis-je ? (utilisées par les règles d'accès) ───────────────────────

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not disabled and not must_change_password)
$$;

create or replace function public.is_trainer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and not disabled and not must_change_password
      and ('formateur' = any (sections) or is_admin)
  )
$$;

create or replace function public.my_participant_id() returns text
language sql stable security definer set search_path = public as $$
  select p.id from participants p join profiles pr on pr.id = p.user_id
  where p.user_id = auth.uid() and not pr.disabled and not pr.must_change_password
    and 'participant' = any (pr.sections)
$$;

-- Fin du mot de passe provisoire : la personne a choisi le sien.
create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid();
  insert into events (user_id, kind) values (auth.uid(), 'password_changed');
$$;

-- Réveil quotidien (keepalive/worker.js) : empêche la mise en veille du projet gratuit.
create or replace function public.ping() returns integer
language sql stable as $$ select 1 $$;

-- ── Règles d'accès ─────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.participants enable row level security;
alter table public.patients enable row level security;
alter table public.events enable row level security;

drop policy if exists "son profil" on public.profiles;
create policy "son profil" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "participants visibles" on public.participants;
create policy "participants visibles" on public.participants for select to authenticated
  using (public.is_trainer() or id = public.my_participant_id());

drop policy if exists "fiches visibles" on public.patients;
create policy "fiches visibles" on public.patients for select to authenticated
  using (public.is_trainer() or participant_id = public.my_participant_id());

-- Lecture pour les comptes connectés seulement ; les règles ci-dessus filtrent ligne par ligne.
-- (Les projets récents n'accordent plus ces droits par défaut.)
grant usage on schema public to authenticated;
grant select on public.profiles, public.participants, public.patients to authenticated;

-- Aucune écriture directe : ni insert, ni update, ni delete pour les comptes connectés ou anonymes.
-- La fonction carnet-api écrit avec la clé de service, après vérification.
revoke insert, update, delete on public.profiles, public.participants, public.patients, public.events from anon, authenticated;
revoke all on public.events from anon, authenticated;

grant execute on function public.is_active(), public.is_trainer(), public.my_participant_id(), public.password_changed() to authenticated;
revoke execute on function public.password_changed() from anon;
grant execute on function public.ping() to anon, authenticated;

-- ══ Version 2 (prototype de Lionel, 19.11.2026) : ateliers, inscriptions, participants enrichis ══

-- Ateliers AFYA : le lien et le QR code d'inscription portent l'identifiant de l'atelier.
create table if not exists public.workshops (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),   -- ex. mwanza-2026-11
  place text not null,
  date text not null check (date ~ '^\d{4}-\d{2}$'),      -- mois de l'atelier
  active boolean not null default true                  -- proposé à l'inscription
);

-- Participants : identité professionnelle (jamais celle des patientes), certification d'atelier.
alter table public.participants add column if not exists first_name text not null default '';
alter table public.participants add column if not exists last_name text not null default '';
alter table public.participants add column if not exists email text;
alter table public.participants add column if not exists phone text;
alter table public.participants add column if not exists specialty text;
alter table public.participants add column if not exists workshop_id text references public.workshops (id) on delete set null;
-- Certification de l'atelier, saisie par l'équipe pédagogique : {"date":"2026-11","place":"Mwanza"}.
alter table public.participants add column if not exists ws jsonb;

-- Demandes d'inscription (lien ou QR code d'atelier), validées par un administrateur.
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null default '',
  country text not null,
  hospital text not null,
  specialty text not null,
  workshop_id text references public.workshops (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz
);
create index if not exists registrations_status on public.registrations (status, created_at);

alter table public.workshops enable row level security;
alter table public.registrations enable row level security;

-- Les ateliers sont publics (formulaire d'inscription, affiche) ; les demandes ne sont lues que
-- par la fonction carnet-api.
drop policy if exists "ateliers publics" on public.workshops;
create policy "ateliers publics" on public.workshops for select to anon, authenticated using (true);
grant usage on schema public to anon;
grant select on public.workshops to anon, authenticated;
revoke insert, update, delete on public.workshops from anon, authenticated;
revoke all on public.registrations from anon, authenticated;

-- Premier atelier, à compléter ou corriger dans l'app (Comptes, Ateliers).
insert into public.workshops (id, place, date) values
  ('mwanza-2026-11', 'Mwanza', '2026-11'),
  ('addis-2026-10', 'Addis-Abeba', '2026-10'),
  ('kinshasa-2026-04', 'Kinshasa', '2026-04')
on conflict (id) do nothing;

-- Clé du numéro des patientes (ETH_GIRMA_001) : le nom sans accents, figé à l'inscription. Deux
-- praticiens du même pays et du même nom : le second reçoit GIRMA2.
alter table public.participants add column if not exists code_key text;
create unique index if not exists participants_code_key on public.participants (country, code_key);

-- Clé de service (fonction carnet-api) : les projets récents ne lui accordent plus les tables par
-- défaut, d'où « permission denied for table profiles ». Elle seule écrit, après vérification.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
