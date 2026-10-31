-- NOCELLI PRIVATE CLUB — mise à jour 2 (31.10.2026) : nouvelles formules.
-- À coller dans Supabase > SQL Editor, puis Run. Sans danger : ne supprime rien, peut être relancée.
--   * Signature : CHF 350 par an, 2 événements privés inclus par année d'adhésion.
--   * Fondateurs : événements ouverts au tarif fondateur (un tiers de moins : CHF 100 au lieu de 150).
-- Le prix de Signature lui-même est chez Stripe (secret STRIPE_PRIX_SIGNATURE) : voir LISEZMOI.md.

-- 1. Chaque inscription garde son prix.
-- Prix fixé à l'inscription (voir tarif_evenement). inclus = un des 2 événements de l'année Signature.
alter table public.inscriptions add column if not exists montant numeric(8,2) not null default 0 check (montant >= 0);
alter table public.inscriptions add column if not exists tarif text not null default 'gratuit'
  check (tarif in ('gratuit', 'inclus', 'fondateur', 'normal'));
alter table public.inscriptions add column if not exists inclus boolean not null default false;
alter table public.inscriptions add column if not exists abonnement_id uuid references public.abonnements(id);
alter table public.inscriptions add column if not exists periode timestamptz;   -- début de l'année d'adhésion

-- 2. Les fondateurs ont accès aux événements (payants).
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
  -- Événements : membres Signature (2 inclus par an) et fondateurs (tarif fondateur) ; voir tarif_evenement.
  return query select
    case when v_fondateur then 'founders' when v_signature then 'signature' end,
    v_fondateur or v_signature,
    v_fondateur or v_signature,
    v_fondateur or v_signature,
    v_fondateur or v_signature;
end $$;

-- 3. Prix d'un événement pour un membre, et inscription au bon prix.
create or replace function public.tarif_evenement(p_compte uuid, p_evenement uuid)
returns table (montant numeric, tarif text, inclus boolean, abonnement_id uuid, periode timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_prix numeric; v_fondateur boolean; ab public.abonnements; v_pris integer;
begin
  if not coalesce((select d.evenements from public.droits_de(p_compte) d), false) then return; end if;
  select e.prix into v_prix from public.evenements e where e.id = p_evenement;
  if not found then return; end if;
  if v_prix = 0 then return query select 0::numeric, 'gratuit', false, null::uuid, null::timestamptz; return; end if;
  select * into ab from public.abonnements a
   where a.compte_id = p_compte
     and ((a.statut = 'actif' and a.fin > now()) or (a.statut = 'impaye' and a.fin + interval '7 days' > now()))
   limit 1;
  if found then
    select count(*) into v_pris from public.inscriptions i
     where i.compte_id = p_compte and i.inclus and i.statut <> 'annule' and i.abonnement_id = ab.id and i.periode = ab.debut;
    if v_pris < 2 then return query select 0::numeric, 'inclus', true, ab.id, ab.debut; return; end if;
  end if;
  v_fondateur := exists (select 1 from public.places_fondateurs where compte_id = p_compte and statut = 'confirme');
  if v_fondateur then return query select round(v_prix * 2 / 3), 'fondateur', false, null::uuid, null::timestamptz; return; end if;
  return query select v_prix, 'normal', false, null::uuid, null::timestamptz;
end $$;

-- Ouverte aux clients : son propre prix pour chaque événement à venir.
create or replace function public.mes_tarifs_evenements()
returns table (evenement_id uuid, montant numeric, tarif text)
language sql stable security definer set search_path = public as $$
  select e.id, t.montant, t.tarif
    from public.evenements e, lateral public.tarif_evenement(auth.uid(), e.id) t
   where auth.uid() is not null and e.publie and not e.annule and e.date > now()
$$;

create or replace function public.inscrire_evenement(p_evenement uuid)
returns text     -- 'confirme' ou 'attente'
language plpgsql security definer set search_path = public as $$
declare e public.evenements; v_pris integer; v_statut text; v_deja text; t record;
begin
  if auth.uid() is null then raise exception 'connexion_requise' using errcode = '42501'; end if;
  if not (select d.evenements from public.droits_de(auth.uid()) d) then
    raise exception 'reserve_club' using errcode = '42501';
  end if;
  -- Verrou sur le compte : deux inscriptions simultanées ne prennent pas trois événements inclus.
  perform 1 from public.profils where id = auth.uid() for update;
  -- Verrou sur l'événement : deux inscriptions simultanées ne prennent pas la même dernière place.
  select * into e from public.evenements where id = p_evenement and publie and not annule for update;
  if not found then raise exception 'introuvable'; end if;
  if e.date <= now() then raise exception 'passe'; end if;
  select statut into v_deja from public.inscriptions
   where evenement_id = e.id and compte_id = auth.uid() and statut <> 'annule';
  if found then return v_deja; end if;
  select count(*) into v_pris from public.inscriptions where evenement_id = e.id and statut = 'confirme';
  v_statut := case when v_pris < e.capacite then 'confirme' else 'attente' end;
  select * into t from public.tarif_evenement(auth.uid(), e.id);
  insert into public.inscriptions (evenement_id, compte_id, statut, montant, tarif, inclus, abonnement_id, periode)
  values (e.id, auth.uid(), v_statut, t.montant, t.tarif, t.inclus, t.abonnement_id, t.periode);
  return v_statut;
end $$;

-- 4. Les membres lisent leurs propres tarifs.
revoke execute on function public.tarif_evenement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mes_tarifs_evenements() to authenticated;
grant execute on function public.tarif_evenement(uuid, uuid), public.mes_tarifs_evenements() to service_role;
