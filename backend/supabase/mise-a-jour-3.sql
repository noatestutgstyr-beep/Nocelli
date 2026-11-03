-- Mise à jour 3 (Noa, 3 novembre 2026) : les fondateurs ont accès à tout,
-- y compris les collections 72 h avant le public. À lancer une fois dans Supabase > SQL Editor.

create or replace function public.reserver_piece(p_lancement uuid, p_taille text)
returns uuid    -- commande en attente de paiement
language plpgsql security definer set search_path = public as $$
declare l public.lancements; v_phase text; v_cmd uuid;
begin
  if auth.uid() is null then raise exception 'connexion_requise' using errcode = '42501'; end if;
  select * into l from public.lancements where id = p_lancement and publie;
  if not found then raise exception 'introuvable'; end if;
  v_phase := public.phase_lancement(l);
  -- Signature et Founders : 24 h de plus (72 h avant le public).
  if v_phase = 'annonce' and now() >= l.public_le - make_interval(hours => l.heures_anticipees + 24)
     and (exists (select 1 from public.abonnements a where a.compte_id = auth.uid()
                  and ((a.statut = 'actif' and a.fin > now()) or (a.statut = 'impaye' and a.fin + interval '7 days' > now())))
          or exists (select 1 from public.places_fondateurs pf where pf.compte_id = auth.uid() and pf.statut = 'confirme')) then
    v_phase := 'membres';
  end if;
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
