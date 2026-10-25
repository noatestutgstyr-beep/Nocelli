-- NOCELLI PRIVATE CLUB — mise à jour 1 (à coller dans Supabase > SQL Editor, puis Run).
-- Sans danger : ne supprime rien, peut être relancée.

-- 1. Les visiteurs non connectés peuvent lire les collections publiées
--    (la règle de lecture appelle est_admin(), qui répond simplement « non » pour eux).
grant execute on function public.est_admin() to anon;

-- 2. Nombre de places fondateurs encore libres, affiché sur la page du club.
create or replace function public.places_fondateurs_restantes() returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, 51 - prochain) from public.compteur_fondateurs where id
$$;
grant execute on function public.places_fondateurs_restantes() to anon, authenticated;

-- 3. Tâches automatiques : pièces non payées rendues au stock (toutes les 5 min),
--    cartes à préparer mises à jour (chaque nuit).
create extension if not exists pg_cron;
select cron.schedule('liberer-commandes', '*/5 * * * *', 'select public.liberer_commandes_expirees()');
select cron.schedule('synchroniser-envois', '15 3 * * *', 'select public.synchroniser_envois()');
