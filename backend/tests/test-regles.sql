-- Tests des règles du club dans la base (lancé par test-schema.sh).
\set QUIET on
set client_min_messages = notice;

create function ok(p boolean, p_msg text) returns void language plpgsql as $$
begin
  if p is not true then raise exception 'ÉCHEC : %', p_msg; end if;
  raise notice 'ok   %', p_msg;
end $$;

create function test_compte(p_email text) returns uuid language sql as $$
  insert into auth.users (email) values (p_email) returning id
$$;
create function test_commande(p_compte uuid, p_produit text default 'NC-01') returns uuid language sql as $$
  insert into commandes (compte_id, produit, taille) values (p_compte, p_produit, 'M') returning id
$$;
create function webhook() returns void language sql as $$
  select set_config('request.jwt.claim.role', 'service_role', false)
$$;
create function test_abonner(p_compte uuid, p_plan text, p_fin timestamptz default now() + interval '1 year')
returns text language sql as $$
  select webhook();
  select synchroniser_abonnement(gen_random_uuid()::text, p_compte, 'sub_' || gen_random_uuid(), p_plan, 'actif',
                                 now(), p_fin, true)
$$;

-- Préparation des tests de concurrence (appelées depuis test-schema.sh)
create function test_preparer_commandes(n integer) returns void language plpgsql as $$
begin
  delete from places_fondateurs; update compteur_fondateurs set prochain = 1;
  update commandes set statut = 'annulee' where statut = 'en_attente';
  for i in 1..n loop perform test_commande(test_compte('conc' || i || '@exemple.ch')); end loop;
end $$;
create function test_preparer_evenement(n integer, cap integer) returns void language plpgsql as $$
begin
  for i in 1..n loop perform test_abonner(test_compte('sig' || i || '@exemple.ch'), 'signature'); end loop;
  insert into evenements (titre, date, lieu, capacite, publie) values ('Test concurrence', now() + interval '30 days', 'Lugano', cap, true);
end $$;
create function test_preparer_stock(n integer) returns void language plpgsql as $$
declare v uuid;
begin
  insert into lancements (nom, produit, prix, public_le, heures_anticipees, publie)
  values ('Test stock', 'NC-09', 139, now() - interval '1 hour', 48, true) returning id into v;
  insert into stock_lancement values (v, 'M', n);
end $$;

-- ---------------------------------------------------------------------------
\echo '— Comptes'
select test_compte('Luca@Exemple.ch') as luca \gset
select ok((select email from profils where id = :'luca') = 'luca@exemple.ch', 'e-mail enregistré en minuscules');
do $$ begin
  begin perform test_compte('luca@exemple.ch'); raise exception 'doublon accepté';
  exception when unique_violation then perform ok(true, 'pas de deuxième compte pour la même adresse'); end;
end $$;
select ok(length((select carte_jeton from profils where id = :'luca')) = 32, 'jeton de carte aléatoire, sans donnée personnelle');

-- ---------------------------------------------------------------------------
\echo '— Founders Club'
select test_compte('a@exemple.ch') as a, test_compte('b@exemple.ch') as b, test_compte('c@exemple.ch') as c \gset
select test_commande(:'a') as ca1, test_commande(:'a') as ca2, test_commande(:'b') as cb, test_commande(:'c', 'NC-02') as cc \gset
select ok(not exists (select 1 from places_fondateurs), 'commande impayée : aucune place');
select ok(confirmer_paiement_commande(:'ca1', 'pay_a1') = 1, 'premier paiement NC-01 : numéro 001');
select ok(confirmer_paiement_commande(:'ca1', 'pay_a1') is null and (select prochain from compteur_fondateurs) = 2, 'webhook rejoué : pas de second numéro');
select ok(confirmer_paiement_commande(:'ca2', 'pay_a2') is null, 'deuxième cardigan du même client : pas de deuxième place');
select ok(confirmer_paiement_commande(:'cb', 'pay_b') = 2, 'client suivant : numéro 002');
select ok(confirmer_paiement_commande(:'cc', 'pay_c') is null, 'autre produit : pas de place');
select ok((select categorie from droits_de(:'a')) = 'founders', 'le fondateur a la catégorie Founders');
select ok((select votes and acces_anticipe and not evenements from droits_de(:'a')), 'le fondateur : avant-premières et votes, sans événements privés');

select ok(fermer_commande(:'ca1', 'remboursee', 'ref_a1') = 'transferee', 'remboursement d''un des deux cardigans : place gardée');
select ok((select numero from places_fondateurs where compte_id = :'a' and statut = 'confirme') = 1, 'même numéro 001');
select ok(fermer_commande(:'cb', 'remboursee', 'ref_b') = 'retiree', 'remboursement total : numéro retiré');
select ok((select categorie from droits_de(:'b')) is null, 'plus de droits après remboursement');
select test_compte('d@exemple.ch') as d \gset
select test_commande(:'d') as cd \gset
select ok(confirmer_paiement_commande(:'cd', 'pay_d') = 3, 'le numéro retiré 002 n''est pas redonné automatiquement');

do $$ begin
  update compteur_fondateurs set prochain = 51;
  perform ok(confirmer_paiement_commande(test_commande(test_compte('e@exemple.ch')), 'pay_e') is null, 'au-delà de 50 : complet');
end $$;
do $$ begin
  begin insert into places_fondateurs (numero, compte_id, commande_id) select 51, compte_id, commande_id from places_fondateurs limit 1;
        raise exception 'numéro 51 accepté';
  exception when check_violation then perform ok(true, 'la base refuse tout numéro au-delà de 050'); end;
end $$;

-- ---------------------------------------------------------------------------
\echo '— Ce qu''un client ne peut pas faire'
set role authenticated;
select set_config('request.jwt.claim.sub', :'luca', false);
do $$ begin
  begin update profils set role = 'admin' where id = auth.uid(); raise exception 'rôle modifié';
  exception when insufficient_privilege then perform ok(true, 'un client ne peut pas se nommer administrateur'); end;
  begin insert into abonnements (compte_id, plan, statut, debut, fin) values (auth.uid(), 'signature', 'actif', now(), now() + interval '1 year');
        raise exception 'abonnement créé';
  exception when insufficient_privilege then perform ok(true, 'un client ne peut pas s''offrir un abonnement'); end;
  begin insert into places_fondateurs (numero, compte_id, commande_id) values (40, auth.uid(), gen_random_uuid());
        raise exception 'place créée';
  exception when insufficient_privilege then perform ok(true, 'un client ne peut pas s''attribuer une place fondateur'); end;
  begin perform confirmer_paiement_commande(gen_random_uuid(), 'faux');
        raise exception 'paiement simulé';
  exception when insufficient_privilege then perform ok(true, 'un client ne peut pas confirmer un paiement'); end;
  begin perform droits_de(gen_random_uuid()); raise exception 'droits lus';
  exception when insufficient_privilege then perform ok(true, 'un client ne lit pas les droits des autres'); end;
  begin perform admin_suspendre(auth.uid(), false, 'x'); raise exception 'admin';
  exception when insufficient_privilege then perform ok(true, 'les fonctions admin refusent un client'); end;
  update profils set nom = 'Luca' where id = auth.uid();
  perform ok((select nom from profils where id = auth.uid()) = 'Luca', 'un client peut changer son nom');
  perform ok((select count(*) from places_fondateurs) = 0, 'un client ne voit pas les autres fondateurs');
  perform ok((select count(*) from profils) = 1, 'un client ne voit que son profil');
end $$;
reset role;

-- ---------------------------------------------------------------------------
\echo '— Abonnements'
select ok(peut_souscrire(:'luca', 'founders') = 'formule_non_vendue', 'le Founders Club ne se vend pas');
select ok(peut_souscrire(:'luca', 'early') = 'formule_non_vendue', 'Early Access n''existe plus');
do $$ begin
  begin insert into abonnements (compte_id, plan, statut, debut, fin) select id, 'early', 'actif', now(), now() from profils limit 1; raise exception 'accepté';
  exception when check_violation then perform ok(true, 'la base refuse toute autre formule que Signature'); end;
end $$;
select ok(peut_souscrire(:'a', 'signature') = 'ok', 'un fondateur peut prendre Signature');
select ok(not (select evenements from droits_de(:'a')), 'fondateur seul : pas d''événements privés');
select ok((select acces_anticipe and votes and contenus from droits_de(:'a')), 'fondateur : avant-premières, votes, contenus');
select ok(test_abonner(:'luca', 'signature') = 'ok', 'Signature activé par le webhook');
select ok(peut_souscrire(:'luca', 'signature') = 'deja_abonne', 'pas de deuxième abonnement');
select ok(test_abonner(:'luca', 'signature') = 'doublon_a_rembourser', 'un deuxième abonnement vivant est refusé par la base');
select ok((select categorie from droits_de(:'luca')) = 'signature', 'catégorie Signature');
select ok((select evenements from droits_de(:'luca')), 'Signature : événements privés');
select ok((select numero_membre from profils where id = :'luca') is not null, 'numéro de membre attribué');
select test_compte('vieux@exemple.ch') as vieux \gset
select test_abonner(:'vieux', 'signature', now() - interval '1 day');
select ok((select categorie from droits_de(:'vieux')) is null, 'abonnement échu : plus de droits');
update abonnements set statut = 'impaye' where compte_id = :'vieux';
select ok((select categorie from droits_de(:'vieux')) = 'signature', 'impayé : 7 jours de grâce');
update abonnements set fin = now() - interval '8 days' where compte_id = :'vieux';
select ok((select categorie from droits_de(:'vieux')) is null, 'impayé depuis plus de 7 jours : plus de droits');
do $$ begin
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  begin perform synchroniser_abonnement('x', gen_random_uuid(), 'x', 'signature', 'actif', now(), now(), true);
        raise exception 'accepté';
  exception when insufficient_privilege then perform ok(true, 'seul le webhook écrit les abonnements'); end;
end $$;

-- ---------------------------------------------------------------------------
\echo '— Accès anticipé'
select test_compte('visiteur@exemple.ch') as vis \gset
insert into lancements (nom, produit, prix, public_le, heures_anticipees, publie)
values ('NC-02 test', 'NC-02', 159, now() + interval '10 hours', 48, true) returning id as lan \gset
insert into stock_lancement values (:'lan', 'M', 5);
set role authenticated;
select set_config('request.jwt.claim.sub', :'vis', false);
do $$ begin
  begin perform reserver_piece((select id from lancements where nom = 'NC-02 test'), 'M'); raise exception 'vendu';
  exception when insufficient_privilege then perform ok(true, 'non-membre : achat refusé par le serveur avant la date publique'); end;
end $$;
select set_config('request.jwt.claim.sub', :'luca', false);
select ok(reserver_piece(:'lan', 'M') is not null, 'membre Signature : achat possible 48 h avant');
select set_config('request.jwt.claim.sub', :'a', false);
select ok(reserver_piece(:'lan', 'M') is not null, 'fondateur : achat possible 48 h avant');
reset role;
update lancements set heures_anticipees = 6 where id = :'lan';
set role authenticated;
select set_config('request.jwt.claim.sub', :'luca', false);
do $$ begin
  begin perform reserver_piece((select id from lancements where nom = 'NC-02 test'), 'M'); raise exception 'vendu';
  exception when raise_exception then perform ok(sqlerrm = 'pas_ouvert', 'durée réglable : à 6 h, pas encore ouvert 10 h avant');
  end;
end $$;
reset role;
select ok((select quantite from stock_lancement where lancement_id = :'lan') = 3, 'stock décompté');
update commandes set cree_le = now() - interval '31 minutes' where lancement_id = :'lan';
select liberer_commandes_expirees();
select ok((select quantite from stock_lancement where lancement_id = :'lan') = 5, 'commande jamais payée : pièce rendue au stock');

-- ---------------------------------------------------------------------------
\echo '— Événements'
select test_compte('s1@exemple.ch') as s1, test_compte('s2@exemple.ch') as s2 \gset
select test_abonner(:'s1', 'signature'), test_abonner(:'s2', 'signature');
insert into evenements (titre, date, lieu, capacite, publie) values ('Présentation', now() + interval '20 days', 'Lugano', 1, true) returning id as ev \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false);
do $$ begin
  begin perform inscrire_evenement((select id from evenements where titre = 'Présentation')); raise exception 'inscrit';
  exception when insufficient_privilege then perform ok(true, 'fondateur sans Signature : inscription aux événements refusée'); end;
end $$;
select set_config('request.jwt.claim.sub', :'s1', false);
select ok(inscrire_evenement(:'ev') = 'confirme', 'Signature : inscription confirmée');
select ok(inscrire_evenement(:'ev') = 'confirme', 'pas de double inscription');
select set_config('request.jwt.claim.sub', :'s2', false);
select ok(inscrire_evenement(:'ev') = 'attente', 'complet : liste d''attente');
select ok((select restantes from evenements_places where id = :'ev') = 0, 'places restantes : 0');
select set_config('request.jwt.claim.sub', :'s1', false);
select annuler_inscription(:'ev');
reset role;
select ok((select statut from inscriptions where evenement_id = :'ev' and compte_id = :'s2') = 'confirme', 'place libérée : la liste d''attente passe');

-- ---------------------------------------------------------------------------
\echo '— Administration tracée'
update profils set role = 'admin' where email = 'luca@exemple.ch';
select set_config('request.jwt.claim.sub', :'luca', false);
select admin_suspendre(:'s2', true, 'test');
select ok((select categorie from droits_de(:'s2')) is null, 'membre suspendu : aucun droit');
select ok(exists (select 1 from journal_admin where action = 'suspendre' and cible = :'s2'), 'action inscrite au journal');
select test_commande(:'b') as cb2 \gset
select confirmer_paiement_commande(:'cb2', 'pay_b2');
select admin_reattribuer_numero(2, :'b', 'nouvel achat');
select ok((select compte_id from places_fondateurs where numero = 2) = :'b'::uuid, 'numéro retiré redonné manuellement, tracé');
update profils set role = 'client' where email = 'luca@exemple.ch';
select set_config('request.jwt.claim.sub', '', false);

-- ---------------------------------------------------------------------------
\echo '— Carte imprimée envoyée par la poste'
select test_compte('poste@exemple.ch') as po, test_compte('autre@exemple.ch') as au \gset
select webhook();
select synchroniser_abonnement('evt_po1', :'po', 'sub_po', 'signature', 'actif', now(), now() + interval '1 year', true);
select ok((select statut from envois_cartes where compte_id = :'po') = 'adresse_manquante', 'nouvel abonné : carte en attente d''adresse');
select ok((select mode from envois_cartes where compte_id = :'po') = 'poste', 'abonné : carte par la poste');
set role authenticated;
select set_config('request.jwt.claim.sub', :'po', false);
do $$ begin
  begin perform enregistrer_adresse('Luca Rossi', 'Via Nassa 12', '', '690', 'Lugano', 'CH'); raise exception 'NPA accepté';
  exception when check_violation then perform ok(true, 'NPA invalide refusé'); end;
  begin perform enregistrer_adresse('Luca Rossi', 'Via Nassa 12', '', '6900', 'Lugano', 'FR'); raise exception 'pays accepté';
  exception when check_violation then perform ok(true, 'pays hors Suisse / Liechtenstein refusé'); end;
end $$;
select enregistrer_adresse('Luca Rossi', 'Via Nassa 12', '', '6900', 'Lugano', 'CH');
select ok((select statut from envois_cartes where compte_id = :'po') = 'a_preparer', 'adresse donnée : carte à préparer');
select ok((select count(*) from envois_cartes where compte_id <> :'po') = 0, 'un client ne voit que ses propres envois');
select ok((select count(*) from adresses where compte_id <> :'po') = 0, 'un client ne voit que sa propre adresse');
do $$ begin
  begin update envois_cartes set statut = 'envoyee'; raise exception 'écriture acceptée';
  exception when insufficient_privilege then perform ok(true, 'un client ne peut pas modifier un envoi'); end;
  begin perform admin_marquer_carte_envoyee((select id from envois_cartes limit 1)); raise exception 'accepté';
  exception when insufficient_privilege then perform ok(true, 'un client ne peut pas marquer une carte envoyée'); end;
end $$;
reset role;
select webhook();
select ok((select statut from envois_cartes where compte_id = :'po' and categorie = 'signature') = 'a_preparer', 'carte Signature à préparer');
update profils set role = 'admin' where email = 'luca@exemple.ch';
select set_config('request.jwt.claim.sub', :'luca', false);
select set_config('request.jwt.claim.role', '', false);
select admin_marquer_carte_envoyee((select id from envois_cartes where compte_id = :'po' and categorie = 'signature'));
select ok((select adresse->>'npa' from envois_cartes where compte_id = :'po' and statut = 'envoyee') = '6900', 'envoi : adresse figée pour la trace');
select ok(exists (select 1 from journal_admin where action = 'carte_envoyee' and cible = :'po'), 'envoi inscrit au journal');
do $$ begin
  begin perform admin_marquer_carte_envoyee((select id from envois_cartes where statut = 'envoyee' limit 1)); raise exception 'deux fois';
  exception when raise_exception then perform ok(sqlerrm like 'envoi_pas_pret%', 'une carte ne part pas deux fois'); end;
end $$;
select webhook();
select synchroniser_abonnement('evt_po3', :'po', 'sub_po', 'signature', 'actif', now() + interval '1 year', now() + interval '2 years', true);
select ok((select count(*) from envois_cartes where compte_id = :'po' and statut <> 'annulee') = 1, 'renouvellement : aucune nouvelle carte');
select set_config('request.jwt.claim.role', '', false);
select admin_remplacer_carte(:'po', 'carte perdue');
select ok((select motif from envois_cartes where compte_id = :'po' and statut = 'a_preparer') = 'remplacement', 'carte perdue : nouvelle carte, même numéro');
do $$ begin
  begin perform admin_remplacer_carte((select id from profils where email = 'poste@exemple.ch'), 'encore'); raise exception 'deux en cours';
  exception when unique_violation then perform ok(true, 'jamais deux cartes en préparation pour un compte'); end;
end $$;
select ok((select mode from envois_cartes where compte_id = :'a' and categorie = 'founders') = 'colis', 'fondateur : carte dans le colis du cardigan');
select ok((select numero from envois_cartes where compte_id = :'b' and categorie = 'founders' and statut <> 'annulee') = 2, 'numéro redonné : carte avec ce numéro');
select test_compte('remb@exemple.ch') as rb \gset
select test_commande(:'rb') as crb \gset
select prochain as prochain_avant from compteur_fondateurs \gset
update compteur_fondateurs set prochain = 40 where id;   -- un numéro libre pour ce test
select ok(confirmer_paiement_commande(:'crb', 'pay_rb') = 40, 'paiement NC-01 : place 040');
select ok((select statut from envois_cartes where compte_id = :'rb') = 'adresse_manquante', 'nouveau fondateur : carte prévue');
select fermer_commande(:'crb', 'remboursee', 'refund_rb');
select ok((select statut || '/' || motif from envois_cartes where compte_id = :'rb') = 'annulee/plus_membre', 'fondateur remboursé avant l''envoi : carte annulée');
update compteur_fondateurs set prochain = :prochain_avant where id;
update profils set role = 'client' where email = 'luca@exemple.ch';
select set_config('request.jwt.claim.sub', '', false);
