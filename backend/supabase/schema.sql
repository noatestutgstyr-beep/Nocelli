-- NOCELLI PRIVATE CLUB — base de données (PostgreSQL / Supabase)
--
-- Mêmes règles que club/regles.js, appliquées par le serveur :
--   * les clients ne peuvent RIEN écrire directement dans les tables sensibles
--     (catégorie, places fondateurs, abonnements) : seules les fonctions
--     ci-dessous, appelées par le webhook de paiement ou par un administrateur,
--     les modifient ;
--   * chaque action d'administration est inscrite dans journal_admin ;
--   * les 50 places fondateurs sont attribuées sous verrou : deux paiements
--     simultanés ne peuvent pas recevoir le même numéro.
--
-- À coller dans Supabase > SQL Editor (ou : supabase db push).
-- Testé avec PostgreSQL 16 par backend/tests/test-schema.sh.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Comptes : un profil par compte Supabase Auth (une adresse e-mail = un compte)
-- ---------------------------------------------------------------------------
create table if not exists public.profils (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique check (email = lower(email)),
  nom           text not null default '',
  role          text not null default 'client' check (role in ('client', 'admin')),
  numero_membre integer unique,
  -- Jeton aléatoire imprimé dans le QR code : aucune donnée personnelle,
  -- et il ne donne accès à rien sans connexion.
  carte_jeton   text not null unique default encode(gen_random_bytes(16), 'hex'),
  suspendu      boolean not null default false,
  cree_le       timestamptz not null default now()
);
create sequence if not exists public.numero_membre_seq;

-- Crée le profil à la création du compte Auth.
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists creer_profil on auth.users;
create trigger creer_profil after insert on auth.users
  for each row execute function public.creer_profil();

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'admin' and not suspendu)
$$;

-- ---------------------------------------------------------------------------
-- Commandes (cardigan NC-01 et futures collections)
-- ---------------------------------------------------------------------------
create table if not exists public.lancements (
  id                 uuid primary key default gen_random_uuid(),
  nom                text not null,
  produit            text not null,
  description        text not null default '',
  prix               numeric(8,2) not null check (prix >= 0),
  public_le          timestamptz not null,
  heures_anticipees  integer not null default 48 check (heures_anticipees between 0 and 336),
  publie             boolean not null default false,
  cree_le            timestamptz not null default now()
);

create table if not exists public.stock_lancement (
  lancement_id uuid not null references public.lancements(id) on delete cascade,
  taille       text not null,
  quantite     integer not null check (quantite >= 0),
  primary key (lancement_id, taille)
);

create table if not exists public.commandes (
  id             uuid primary key default gen_random_uuid(),
  compte_id      uuid not null references public.profils(id),
  produit        text not null,
  lancement_id   uuid references public.lancements(id),
  taille         text,
  quantite       integer not null default 1 check (quantite > 0),
  statut         text not null default 'en_attente'
                 check (statut in ('en_attente', 'payee', 'annulee', 'remboursee', 'expiree')),
  stripe_session text unique,
  cree_le        timestamptz not null default now(),
  payee_le       timestamptz,
  fermee_le      timestamptz
);
create index if not exists commandes_compte on public.commandes (compte_id);

-- ---------------------------------------------------------------------------
-- Founders Club : 50 numéros, jamais plus, jamais deux fois
-- ---------------------------------------------------------------------------
create table if not exists public.places_fondateurs (
  numero      integer primary key check (numero between 1 and 50),
  compte_id   uuid not null references public.profils(id),
  commande_id uuid not null references public.commandes(id),
  statut      text not null default 'confirme' check (statut in ('confirme', 'retire')),
  attribue_le timestamptz not null default now(),
  retire_le   timestamptz,
  motif       text
);
-- Un client n'a qu'une place confirmée.
create unique index if not exists une_place_par_client
  on public.places_fondateurs (compte_id) where statut = 'confirme';

-- Prochain numéro à donner. Une seule ligne, verrouillée pendant l'attribution.
create table if not exists public.compteur_fondateurs (
  id       boolean primary key default true check (id),
  prochain integer not null default 1 check (prochain between 1 and 51)
);
insert into public.compteur_fondateurs (id) values (true) on conflict do nothing;

-- Places fondateurs encore libres (page du club, lisible par tous).
create or replace function public.places_fondateurs_restantes() returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, 51 - prochain) from public.compteur_fondateurs where id
$$;

-- ---------------------------------------------------------------------------
-- Abonnements Early Access (29 CHF/an) et Signature (59 CHF/an)
-- Le prestataire de paiement (Stripe) est la référence pour la facturation ;
-- cette table en est le miroir, mis à jour uniquement par le webhook.
-- ---------------------------------------------------------------------------
create table if not exists public.abonnements (
  id                     uuid primary key default gen_random_uuid(),
  compte_id              uuid not null references public.profils(id),
  plan                   text not null default 'signature' check (plan = 'signature'),
  statut                 text not null check (statut in ('actif', 'impaye', 'annule', 'expire')),
  debut                  timestamptz not null,
  fin                    timestamptz not null,
  renouvellement_auto    boolean not null default true,
  stripe_abonnement      text unique,
  maj_le                 timestamptz not null default now()
);
-- Jamais deux abonnements vivants pour un même compte.
create unique index if not exists un_abonnement_vivant
  on public.abonnements (compte_id) where statut in ('actif', 'impaye');

create table if not exists public.paiements (
  id           text primary key,          -- identifiant Stripe (facture) : pas de doublon
  compte_id    uuid not null references public.profils(id),
  abonnement_id uuid references public.abonnements(id),
  montant      numeric(8,2) not null,
  devise       text not null default 'chf',
  type         text not null,
  le           timestamptz not null default now()
);

-- Événements Stripe déjà traités (un webhook rejoué ne fait rien).
create table if not exists public.webhooks_traites (
  id      text primary key,
  type    text not null,
  recu_le timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Événements privés
-- ---------------------------------------------------------------------------
create table if not exists public.evenements (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null,
  description text not null default '',
  date        timestamptz not null,
  lieu        text not null,
  capacite    integer not null check (capacite > 0),
  prix        numeric(8,2) not null default 0 check (prix >= 0),  -- 0 = entrée incluse
  conditions  text not null default '',
  publie      boolean not null default false,
  annule      boolean not null default false,
  cree_le     timestamptz not null default now()
);

create table if not exists public.inscriptions (
  id           uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  compte_id    uuid not null references public.profils(id),
  statut       text not null check (statut in ('confirme', 'attente', 'annule')),
  cree_le      timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);
create unique index if not exists une_inscription_vivante
  on public.inscriptions (evenement_id, compte_id) where statut <> 'annule';

-- ---------------------------------------------------------------------------
-- Journal des actions d'administration (on n'y efface rien)
-- ---------------------------------------------------------------------------
create table if not exists public.journal_admin (
  id       bigserial primary key,
  admin_id uuid,
  action   text not null,
  cible    text,
  details  jsonb not null default '{}',
  le       timestamptz not null default now()
);

create or replace function public.journaliser(p_action text, p_cible text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.journal_admin (admin_id, action, cible, details)
  values (auth.uid(), p_action, p_cible, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function public.exiger_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'reserve_admin' using errcode = '42501'; end if;
end $$;

-- ===========================================================================
-- DROITS : la seule source de vérité
-- ===========================================================================
-- Interne (non ouverte aux clients) : droits d'un compte.
create or replace function public.droits_de(p_compte uuid)
returns table (categorie text, acces_anticipe boolean, evenements boolean, votes boolean, contenus boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_fondateur boolean; v_signature boolean;
begin
  if p_compte is null or exists (select 1 from public.profils where id = p_compte and suspendu) then
    return query select null::text, false, false, false, false; return;
  end if;
  v_fondateur := exists (select 1 from public.places_fondateurs where compte_id = p_compte and statut = 'confirme');
  v_signature := exists (select 1 from public.abonnements a
     where a.compte_id = p_compte
       and ((a.statut = 'actif' and a.fin > now())
         or (a.statut = 'impaye' and a.fin + interval '7 days' > now())));
  -- Les événements privés viennent seulement de Signature (un fondateur peut la prendre en plus).
  return query select
    case when v_fondateur then 'founders' when v_signature then 'signature' end,
    v_fondateur or v_signature,
    v_signature,
    v_fondateur or v_signature,
    v_fondateur or v_signature;
end $$;

-- Ouverte aux clients : uniquement ses propres droits (l'administration lit tout).
create or replace function public.droits(p_compte uuid default auth.uid())
returns table (categorie text, acces_anticipe boolean, evenements boolean, votes boolean, contenus boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_compte is distinct from auth.uid() and not public.est_admin() then
    raise exception 'interdit' using errcode = '42501';
  end if;
  return query select * from public.droits_de(p_compte);
end $$;

-- ===========================================================================
-- FOUNDERS : attribution à la confirmation du paiement (webhook uniquement)
-- ===========================================================================
create or replace function public.confirmer_paiement_commande(p_commande uuid, p_evenement text)
returns integer   -- numéro fondateur attribué, ou null
language plpgsql security definer set search_path = public as $$
declare
  c        public.commandes;
  v_numero integer;
begin
  insert into public.webhooks_traites (id, type) values (p_evenement, 'commande_payee')
  on conflict (id) do nothing;
  if not found then return null; end if;                       -- déjà traité

  select * into c from public.commandes where id = p_commande for update;
  if not found then raise exception 'commande_introuvable'; end if;
  if c.statut = 'payee' then return null; end if;
  if c.statut <> 'en_attente' then raise exception 'commande_fermee'; end if;

  update public.commandes set statut = 'payee', payee_le = now() where id = c.id;
  if c.produit <> 'NC-01' then return null; end if;

  -- Verrou unique : les paiements simultanés passent l'un après l'autre ici.
  select prochain into v_numero from public.compteur_fondateurs where id for update;
  if exists (select 1 from public.places_fondateurs where compte_id = c.compte_id and statut = 'confirme') then
    return null;                                               -- déjà fondateur
  end if;
  if v_numero > 50 then return null; end if;                   -- complet

  insert into public.places_fondateurs (numero, compte_id, commande_id) values (v_numero, c.compte_id, c.id);
  update public.compteur_fondateurs set prochain = v_numero + 1 where id;
  perform public.synchroniser_envoi(c.compte_id);
  return v_numero;
end $$;

-- Remboursement ou annulation d'une commande payée.
-- Règle : la place passe sur une autre commande NC-01 payée du même client si
-- elle existe ; sinon le numéro est RETIRÉ et n'est jamais redonné automatiquement.
create or replace function public.fermer_commande(p_commande uuid, p_statut text, p_evenement text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c       public.commandes;
  v_autre uuid;
  v_place integer;
begin
  if p_statut not in ('remboursee', 'annulee') then raise exception 'statut_inconnu'; end if;
  insert into public.webhooks_traites (id, type) values (p_evenement, 'commande_' || p_statut)
  on conflict (id) do nothing;
  if not found then return 'deja_traite'; end if;

  select * into c from public.commandes where id = p_commande for update;
  if not found then raise exception 'commande_introuvable'; end if;
  update public.commandes set statut = p_statut, fermee_le = now() where id = c.id;
  if c.statut <> 'payee' then return 'sans_effet'; end if;

  perform 1 from public.compteur_fondateurs where id for update;
  select numero into v_place from public.places_fondateurs
   where commande_id = c.id and statut = 'confirme';
  if v_place is null then return 'sans_effet'; end if;

  select id into v_autre from public.commandes
   where compte_id = c.compte_id and id <> c.id and produit = 'NC-01' and statut = 'payee'
   order by payee_le limit 1;
  if v_autre is not null then
    update public.places_fondateurs set commande_id = v_autre where numero = v_place;
    return 'transferee';
  end if;
  update public.places_fondateurs
     set statut = 'retire', retire_le = now(),
         motif = case p_statut when 'remboursee' then 'Commande remboursée' else 'Commande annulée' end
   where numero = v_place;
  perform public.synchroniser_envoi(c.compte_id);
  return 'retiree';
end $$;

-- Décision manuelle, tracée : redonner un numéro retiré à un acheteur NC-01 payé sans place.
create or replace function public.admin_reattribuer_numero(p_numero integer, p_compte uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cmd uuid; v_ancien uuid;
begin
  perform public.exiger_admin();
  perform 1 from public.compteur_fondateurs where id for update;
  select compte_id into v_ancien from public.places_fondateurs where numero = p_numero and statut = 'retire';
  if not found then raise exception 'numero_non_retire'; end if;
  if exists (select 1 from public.places_fondateurs where compte_id = p_compte and statut = 'confirme') then
    raise exception 'deja_fondateur';
  end if;
  select id into v_cmd from public.commandes
   where compte_id = p_compte and produit = 'NC-01' and statut = 'payee' order by payee_le limit 1;
  if v_cmd is null then raise exception 'non_eligible'; end if;
  update public.places_fondateurs
     set compte_id = p_compte, commande_id = v_cmd, statut = 'confirme',
         attribue_le = now(), retire_le = null, motif = null
   where numero = p_numero;
  perform public.synchroniser_envoi(p_compte);
  perform public.journaliser('reattribuer_numero', p_numero::text,
    jsonb_build_object('ancien', v_ancien, 'nouveau', p_compte, 'motif', p_motif));
end $$;

-- ===========================================================================
-- ABONNEMENTS : miroir de Stripe, écrit uniquement par le webhook
-- ===========================================================================
create or replace function public.synchroniser_abonnement(
  p_evenement text, p_compte uuid, p_stripe text, p_plan text, p_statut text,
  p_debut timestamptz, p_fin timestamptz, p_renouvellement boolean)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'reserve_webhook' using errcode = '42501'; end if;
  insert into public.webhooks_traites (id, type) values (p_evenement, 'abonnement')
  on conflict (id) do nothing;
  if not found then return 'deja_traite'; end if;
  insert into public.abonnements as a
    (compte_id, stripe_abonnement, plan, statut, debut, fin, renouvellement_auto)
  values (p_compte, p_stripe, p_plan, p_statut, p_debut, p_fin, p_renouvellement)
  on conflict (stripe_abonnement) do update set
    plan = excluded.plan, statut = excluded.statut, debut = excluded.debut, fin = excluded.fin,
    renouvellement_auto = excluded.renouvellement_auto, maj_le = now();
  if p_statut = 'actif' then
    update public.profils set numero_membre = nextval('public.numero_membre_seq')
     where id = p_compte and numero_membre is null;
  end if;
  perform public.synchroniser_envoi(p_compte);
  return 'ok';
exception when unique_violation then
  -- Un deuxième abonnement vivant pour ce compte : refusé, il faut le rembourser.
  return 'doublon_a_rembourser';
end $$;

create or replace function public.enregistrer_paiement(
  p_id text, p_compte uuid, p_stripe_abonnement text, p_montant numeric, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'reserve_webhook' using errcode = '42501'; end if;
  insert into public.paiements (id, compte_id, abonnement_id, montant, type)
  values (p_id, p_compte, (select id from public.abonnements where stripe_abonnement = p_stripe_abonnement), p_montant, p_type)
  on conflict (id) do nothing;
end $$;

-- Utilisé avant d'ouvrir un paiement : refuse le double abonnement et le Founders.
create or replace function public.peut_souscrire(p_compte uuid, p_plan text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_plan <> 'signature' then 'formule_non_vendue'
    when exists (select 1 from public.abonnements where compte_id = p_compte and statut in ('actif', 'impaye')) then 'deja_abonne'
    else 'ok' end
$$;

-- ===========================================================================
-- ACCÈS ANTICIPÉ : la vente est contrôlée ici, pas dans le navigateur
-- ===========================================================================
create or replace function public.phase_lancement(l public.lancements)
returns text language sql stable as $$
  select case
    when now() >= l.public_le then 'public'
    when now() >= l.public_le - make_interval(hours => l.heures_anticipees) then 'membres'
    else 'annonce' end
$$;

create or replace function public.reserver_piece(p_lancement uuid, p_taille text)
returns uuid    -- commande en attente de paiement
language plpgsql security definer set search_path = public as $$
declare l public.lancements; v_phase text; v_cmd uuid;
begin
  if auth.uid() is null then raise exception 'connexion_requise' using errcode = '42501'; end if;
  select * into l from public.lancements where id = p_lancement and publie;
  if not found then raise exception 'introuvable'; end if;
  v_phase := public.phase_lancement(l);
  if v_phase = 'annonce' then raise exception 'pas_ouvert'; end if;
  if v_phase = 'membres' and not (select acces_anticipe from public.droits_de(auth.uid())) then
    raise exception 'reserve_membres' using errcode = '42501';
  end if;
  -- Décrément atomique : jamais sous zéro, même avec des achats simultanés.
  update public.stock_lancement set quantite = quantite - 1
   where lancement_id = l.id and taille = p_taille and quantite > 0;
  if not found then raise exception 'epuise'; end if;
  insert into public.commandes (compte_id, produit, lancement_id, taille)
  values (auth.uid(), l.produit, l.id, p_taille) returning id into v_cmd;
  return v_cmd;
end $$;

-- À lancer toutes les 5 minutes (Supabase > Database > Cron) : rend au stock les pièces jamais payées.
create or replace function public.liberer_commandes_expirees() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with x as (
    update public.commandes set statut = 'expiree', fermee_le = now()
     where statut = 'en_attente' and cree_le < now() - interval '30 minutes' and lancement_id is not null
     returning lancement_id, taille)
  update public.stock_lancement s set quantite = s.quantite + k.n
    from (select lancement_id, taille, count(*)::int n from x group by 1, 2) k
   where s.lancement_id = k.lancement_id and s.taille = k.taille;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===========================================================================
-- ÉVÉNEMENTS : membres Signature uniquement (fondateurs compris s'ils ont Signature)
-- ===========================================================================
create or replace function public.inscrire_evenement(p_evenement uuid)
returns text     -- 'confirme' ou 'attente'
language plpgsql security definer set search_path = public as $$
declare e public.evenements; v_pris integer; v_statut text; v_deja text;
begin
  if auth.uid() is null then raise exception 'connexion_requise' using errcode = '42501'; end if;
  if not (select d.evenements from public.droits_de(auth.uid()) d) then
    raise exception 'reserve_signature' using errcode = '42501';
  end if;
  -- Verrou sur l'événement : deux inscriptions simultanées ne prennent pas la même dernière place.
  select * into e from public.evenements where id = p_evenement and publie and not annule for update;
  if not found then raise exception 'introuvable'; end if;
  if e.date <= now() then raise exception 'passe'; end if;
  select statut into v_deja from public.inscriptions
   where evenement_id = e.id and compte_id = auth.uid() and statut <> 'annule';
  if found then return v_deja; end if;
  select count(*) into v_pris from public.inscriptions where evenement_id = e.id and statut = 'confirme';
  v_statut := case when v_pris < e.capacite then 'confirme' else 'attente' end;
  insert into public.inscriptions (evenement_id, compte_id, statut) values (e.id, auth.uid(), v_statut);
  return v_statut;
end $$;

create or replace function public.annuler_inscription(p_evenement uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_statut text; v_suivant uuid;
begin
  perform 1 from public.evenements where id = p_evenement for update;
  select statut into v_statut from public.inscriptions
   where evenement_id = p_evenement and compte_id = auth.uid() and statut <> 'annule' for update;
  if not found then raise exception 'aucune_inscription'; end if;
  update public.inscriptions set statut = 'annule', maj_le = now()
   where evenement_id = p_evenement and compte_id = auth.uid() and statut <> 'annule';
  if v_statut <> 'confirme' then return; end if;
  -- La place libérée va à la plus ancienne demande en attente, si la personne est toujours membre.
  select i.id into v_suivant from public.inscriptions i, lateral public.droits_de(i.compte_id) d
   where i.evenement_id = p_evenement and i.statut = 'attente' and d.evenements
     and (select count(*) from public.inscriptions c where c.evenement_id = p_evenement and c.statut = 'confirme')
         < (select capacite from public.evenements where id = p_evenement)
   order by i.cree_le limit 1;
  if v_suivant is not null then
    update public.inscriptions set statut = 'confirme', maj_le = now() where id = v_suivant;
  end if;
end $$;

-- Places restantes, lisibles par les membres sans voir qui est inscrit.
create or replace view public.evenements_places with (security_invoker = false) as
  select e.id, greatest(0, e.capacite - count(i.*) filter (where i.statut = 'confirme'))::int as restantes,
         count(i.*) filter (where i.statut = 'attente')::int as en_attente
    from public.evenements e left join public.inscriptions i on i.evenement_id = e.id
   where e.publie
   group by e.id;

-- ===========================================================================
-- ADMINISTRATION (toujours tracée)
-- ===========================================================================
create or replace function public.admin_suspendre(p_compte uuid, p_suspendu boolean, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exiger_admin();
  update public.profils set suspendu = p_suspendu where id = p_compte;
  perform public.synchroniser_envoi(p_compte);
  perform public.journaliser(case when p_suspendu then 'suspendre' else 'retablir' end, p_compte::text,
    jsonb_build_object('motif', p_motif));
end $$;

create or replace function public.admin_enregistrer_lancement(
  p_id uuid, p_nom text, p_produit text, p_description text, p_prix numeric,
  p_public_le timestamptz, p_heures integer, p_publie boolean, p_stock jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); k text;
begin
  perform public.exiger_admin();
  insert into public.lancements (id, nom, produit, description, prix, public_le, heures_anticipees, publie)
  values (v_id, p_nom, p_produit, p_description, p_prix, p_public_le, p_heures, p_publie)
  on conflict (id) do update set nom = excluded.nom, produit = excluded.produit,
    description = excluded.description, prix = excluded.prix, public_le = excluded.public_le,
    heures_anticipees = excluded.heures_anticipees, publie = excluded.publie;
  for k in select jsonb_object_keys(coalesce(p_stock, '{}')) loop
    insert into public.stock_lancement (lancement_id, taille, quantite)
    values (v_id, k, (p_stock ->> k)::int)
    on conflict (lancement_id, taille) do update set quantite = excluded.quantite;
  end loop;
  perform public.journaliser('lancement', v_id::text,
    jsonb_build_object('nom', p_nom, 'public_le', p_public_le, 'heures', p_heures, 'stock', p_stock, 'publie', p_publie));
  return v_id;
end $$;

create or replace function public.admin_enregistrer_evenement(
  p_id uuid, p_titre text, p_description text, p_date timestamptz, p_lieu text,
  p_capacite integer, p_prix numeric, p_conditions text, p_publie boolean, p_annule boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform public.exiger_admin();
  insert into public.evenements (id, titre, description, date, lieu, capacite, prix, conditions, publie, annule)
  values (v_id, p_titre, p_description, p_date, p_lieu, p_capacite, p_prix, p_conditions, p_publie, p_annule)
  on conflict (id) do update set titre = excluded.titre, description = excluded.description,
    date = excluded.date, lieu = excluded.lieu, capacite = excluded.capacite, prix = excluded.prix,
    conditions = excluded.conditions, publie = excluded.publie, annule = excluded.annule;
  perform public.journaliser('evenement', v_id::text,
    jsonb_build_object('titre', p_titre, 'date', p_date, 'capacite', p_capacite, 'publie', p_publie, 'annule', p_annule));
  return v_id;
end $$;

-- Vérification d'une carte présentée (QR code), réservée à l'équipe.
create or replace function public.admin_verifier_carte(p_jeton text)
returns table (nom text, categorie text, numero text)
language plpgsql security definer set search_path = public as $$
declare p public.profils; d record;
begin
  perform public.exiger_admin();
  select * into p from public.profils where carte_jeton = p_jeton;
  if not found then return; end if;
  select * into d from public.droits_de(p.id);
  perform public.journaliser('verifier_carte', p.id::text, '{}');
  return query select p.nom, d.categorie,
    coalesce((select lpad(numero::text, 3, '0') || ' / 050' from public.places_fondateurs
               where compte_id = p.id and statut = 'confirme'), lpad(p.numero_membre::text, 4, '0'));
end $$;

-- ===========================================================================
-- CARTE IMPRIMÉE envoyée par la poste
-- ===========================================================================
-- Une carte par catégorie et par compte, envoyée une fois (le numéro est à vie,
-- un renouvellement n'envoie rien). Fondateurs : carte glissée dans le colis
-- du cardigan. Une carte pas encore partie est annulée si le compte n'est plus
-- membre ou change de catégorie. Même logique que club/regles.js.
create table if not exists public.adresses (
  compte_id  uuid primary key references public.profils(id) on delete cascade,
  nom        text not null check (length(nom) between 1 and 80),
  rue        text not null check (length(rue) between 1 and 120),
  complement text not null default '' check (length(complement) <= 120),
  npa        text not null check (npa ~ '^[0-9]{4}$'),
  localite   text not null check (length(localite) between 1 and 60),
  pays       text not null default 'CH' check (pays in ('CH', 'LI')),
  maj_le     timestamptz not null default now()
);

create table if not exists public.envois_cartes (
  id         uuid primary key default gen_random_uuid(),
  compte_id  uuid not null references public.profils(id),
  categorie  text not null check (categorie in ('founders', 'signature')),
  numero     integer not null,
  mode       text not null check (mode in ('poste', 'colis')),
  statut     text not null check (statut in ('adresse_manquante', 'a_preparer', 'envoyee', 'annulee')),
  motif      text not null default 'nouveau',
  adresse    jsonb,                       -- l'adresse utilisée, figée à l'envoi
  cree_le    timestamptz not null default now(),
  envoyee_le timestamptz,
  annulee_le timestamptz
);
-- Jamais deux cartes en préparation pour le même compte.
create unique index if not exists envoi_en_cours_unique on public.envois_cartes (compte_id)
  where statut in ('adresse_manquante', 'a_preparer');

-- Interne : met l'envoi d'un compte en accord avec ses droits. Sans effet si rien ne change.
create or replace function public.synchroniser_envoi(p_compte uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_num integer;
begin
  perform 1 from public.profils where id = p_compte for update;   -- un appel à la fois par compte
  select categorie into v_cat from public.droits_de(p_compte);
  update public.envois_cartes
     set statut = 'annulee', annulee_le = now(),
         motif = case when v_cat is null then 'plus_membre' else 'remplacee' end
   where compte_id = p_compte and statut in ('adresse_manquante', 'a_preparer')
     and categorie is distinct from v_cat;
  if v_cat is null then return; end if;
  if exists (select 1 from public.envois_cartes where compte_id = p_compte and categorie = v_cat and statut <> 'annulee') then
    return;
  end if;
  if v_cat = 'founders' then
    select numero into v_num from public.places_fondateurs where compte_id = p_compte and statut = 'confirme';
  else
    select numero_membre into v_num from public.profils where id = p_compte;
  end if;
  insert into public.envois_cartes (compte_id, categorie, numero, mode, statut)
  values (p_compte, v_cat, v_num, case when v_cat = 'founders' then 'colis' else 'poste' end,
          case when exists (select 1 from public.adresses where compte_id = p_compte) then 'a_preparer' else 'adresse_manquante' end);
end $$;

-- Planifiée (Supabase > Cron, une fois par jour) : rattrape les adhésions arrivées à échéance.
create or replace function public.synchroniser_envois() returns integer
language plpgsql security definer set search_path = public as $$
declare v uuid; n integer := 0;
begin
  for v in select id from public.profils where role = 'client' loop
    perform public.synchroniser_envoi(v); n := n + 1;
  end loop;
  return n;
end $$;

-- Ouverte aux clients : leur propre adresse, rien d'autre.
create or replace function public.enregistrer_adresse(
  p_nom text, p_rue text, p_complement text, p_npa text, p_localite text, p_pays text default 'CH')
returns void language plpgsql security definer set search_path = public as $$
declare v_moi uuid := auth.uid();
begin
  if v_moi is null then raise exception 'connexion' using errcode = '42501'; end if;
  insert into public.adresses as a (compte_id, nom, rue, complement, npa, localite, pays)
  values (v_moi, trim(p_nom), trim(p_rue), coalesce(trim(p_complement), ''), trim(p_npa), trim(p_localite), upper(coalesce(p_pays, 'CH')))
  on conflict (compte_id) do update set nom = excluded.nom, rue = excluded.rue, complement = excluded.complement,
    npa = excluded.npa, localite = excluded.localite, pays = excluded.pays, maj_le = now();
  update public.envois_cartes set statut = 'a_preparer'
   where compte_id = v_moi and statut = 'adresse_manquante';
end $$;

create or replace function public.admin_marquer_carte_envoyee(p_envoi uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.envois_cartes;
begin
  perform public.exiger_admin();
  select * into e from public.envois_cartes where id = p_envoi for update;
  if not found then raise exception 'envoi_introuvable'; end if;
  if e.statut <> 'a_preparer' then raise exception 'envoi_pas_pret: %', e.statut; end if;
  update public.envois_cartes
     set statut = 'envoyee', envoyee_le = now(),
         adresse = (select to_jsonb(a) - 'compte_id' - 'maj_le' from public.adresses a where a.compte_id = e.compte_id)
   where id = e.id;
  perform public.journaliser('carte_envoyee', e.compte_id::text,
    jsonb_build_object('categorie', e.categorie, 'numero', e.numero, 'mode', e.mode));
end $$;

-- Carte perdue ou abîmée : nouvelle carte de la catégorie actuelle, par la poste.
create or replace function public.admin_remplacer_carte(p_compte uuid, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_num integer;
begin
  perform public.exiger_admin();
  if coalesce(trim(p_motif), '') = '' then raise exception 'motif_obligatoire'; end if;
  perform 1 from public.profils where id = p_compte for update;
  select categorie into v_cat from public.droits_de(p_compte);
  if v_cat is null then raise exception 'non_membre'; end if;
  select numero into v_num from public.envois_cartes
   where compte_id = p_compte and categorie = v_cat and statut = 'envoyee' order by envoyee_le desc limit 1;
  if v_num is null then raise exception 'aucune_carte_envoyee'; end if;
  insert into public.envois_cartes (compte_id, categorie, numero, mode, statut, motif)
  values (p_compte, v_cat, v_num, 'poste',
          case when exists (select 1 from public.adresses where compte_id = p_compte) then 'a_preparer' else 'adresse_manquante' end,
          'remplacement');
  perform public.journaliser('carte_remplacee', p_compte::text, jsonb_build_object('motif', p_motif));
end $$;

-- ===========================================================================
-- SÉCURITÉ DES LIGNES (RLS) : chacun ne lit que ce qui le concerne
-- ===========================================================================
alter table public.profils             enable row level security;
alter table public.commandes           enable row level security;
alter table public.places_fondateurs   enable row level security;
alter table public.compteur_fondateurs enable row level security;
alter table public.abonnements         enable row level security;
alter table public.paiements           enable row level security;
alter table public.webhooks_traites    enable row level security;
alter table public.lancements          enable row level security;
alter table public.stock_lancement     enable row level security;
alter table public.evenements          enable row level security;
alter table public.inscriptions        enable row level security;
alter table public.journal_admin       enable row level security;
alter table public.adresses            enable row level security;
alter table public.envois_cartes       enable row level security;

-- Lecture : soi-même, ou l'administration.
drop policy if exists lire_soi on public.profils;
create policy lire_soi on public.profils for select using (id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.commandes;
create policy lire_soi on public.commandes for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.places_fondateurs;
create policy lire_soi on public.places_fondateurs for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.abonnements;
create policy lire_soi on public.abonnements for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.paiements;
create policy lire_soi on public.paiements for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.inscriptions;
create policy lire_soi on public.inscriptions for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.adresses;
create policy lire_soi on public.adresses for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_soi on public.envois_cartes;
create policy lire_soi on public.envois_cartes for select using (compte_id = auth.uid() or public.est_admin());
drop policy if exists lire_admin on public.journal_admin;
create policy lire_admin on public.journal_admin for select using (public.est_admin());
drop policy if exists lire_admin on public.webhooks_traites;
create policy lire_admin on public.webhooks_traites for select using (public.est_admin());

-- Collections : l'annonce est publique (page d'annonce pour les visiteurs).
drop policy if exists lire_publie on public.lancements;
create policy lire_publie on public.lancements for select using (publie or public.est_admin());
drop policy if exists lire_publie on public.stock_lancement;
create policy lire_publie on public.stock_lancement for select using (
  exists (select 1 from public.lancements l where l.id = lancement_id and (l.publie or public.est_admin())));
-- Événements : visibles par les membres connectés.
drop policy if exists lire_membres on public.evenements;
create policy lire_membres on public.evenements for select using (
  (publie and auth.uid() is not null) or public.est_admin());

-- Écriture : aucune policy d'écriture pour les clients. Seul le nom est modifiable.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profils, public.commandes, public.places_fondateurs, public.abonnements,
  public.paiements, public.inscriptions, public.journal_admin, public.webhooks_traites,
  public.lancements, public.stock_lancement, public.evenements,
  public.adresses, public.envois_cartes to authenticated;
grant select on public.lancements, public.stock_lancement to anon;
grant select on public.evenements_places to authenticated;
grant update (nom) on public.profils to authenticated;
drop policy if exists modifier_nom on public.profils;
create policy modifier_nom on public.profils for update using (id = auth.uid()) with check (id = auth.uid());

-- Fonctions : seules celles destinées aux clients leur sont ouvertes.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.droits(uuid), public.reserver_piece(uuid, text),
  public.inscrire_evenement(uuid), public.annuler_inscription(uuid),
  public.est_admin(), public.peut_souscrire(uuid, text),
  public.enregistrer_adresse(text, text, text, text, text, text) to authenticated;
-- Visiteurs : lire les collections publiées (la règle appelle est_admin) et le compteur fondateurs.
grant execute on function public.est_admin(), public.places_fondateurs_restantes() to anon, authenticated;
grant execute on function public.admin_reattribuer_numero(integer, uuid, text),
  public.admin_suspendre(uuid, boolean, text),
  public.admin_enregistrer_lancement(uuid, text, text, text, numeric, timestamptz, integer, boolean, jsonb),
  public.admin_enregistrer_evenement(uuid, text, text, timestamptz, text, integer, numeric, text, boolean, boolean),
  public.admin_verifier_carte(text),
  public.admin_marquer_carte_envoyee(uuid), public.admin_remplacer_carte(uuid, text) to authenticated;   -- chacune vérifie exiger_admin()
-- Le webhook (clé service_role, jamais dans le navigateur) appelle le reste.
grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
