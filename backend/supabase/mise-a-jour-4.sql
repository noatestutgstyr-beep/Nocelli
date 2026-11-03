-- Mise à jour 4 (3 novembre 2026) : la liste privée du site arrive enfin chez Nocelli.
-- À lancer une fois dans Supabase > SQL Editor. Les inscriptions se lisent ensuite dans
-- Table Editor > liste_privee (ou en CSV avec le bouton Export).
create table if not exists public.liste_privee (
  id uuid primary key default gen_random_uuid(),
  inscrit_le timestamptz not null default now(),
  email text not null unique check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and length(email) <= 200),
  prenom text check (prenom is null or length(prenom) <= 60),
  taille text check (taille is null or taille in ('S', 'M', 'L')),
  langue text check (langue is null or langue in ('fr', 'en', 'it'))
);
alter table public.liste_privee enable row level security;
-- Le site peut seulement ajouter une inscription. Personne ne peut lire, modifier ou effacer depuis le site.
drop policy if exists "inscription publique" on public.liste_privee;
create policy "inscription publique" on public.liste_privee for insert to anon, authenticated with check (true);
grant insert on public.liste_privee to anon, authenticated;
revoke select, update, delete on public.liste_privee from anon, authenticated;
