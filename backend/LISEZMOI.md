# NOCELLI PRIVATE CLUB — serveur

Le site est aujourd'hui **statique** (GitHub Pages) : pas de base de données, pas de comptes,
pas de paiement. Le Private Club fonctionne donc en **mode test** : les pages appellent un
serveur de test qui tourne dans le navigateur (`club/donnees.js`) et applique les vraies règles
(`club/regles.js`). Les données restent dans le navigateur de la personne, aucun paiement réel
n'est possible.

Ce dossier contient le **vrai serveur, prêt à brancher**, qui applique les mêmes règles côté
serveur. Rien n'est activé : il faut l'accord de Noa et deux comptes gratuits.

## Ce qui est prêt

| Fichier | Rôle |
| --- | --- |
| `supabase/schema.sql` | Tables, sécurité ligne par ligne (RLS), règles du club en SQL : 50 places fondateurs sous verrou, abonnements, accès anticipé, stock, événements et liste d'attente, journal d'administration. |
| `supabase/functions/paiement` | Ouvre un paiement Stripe (adhésion, achat d'une pièce), change de formule, arrête ou reprend le renouvellement. |
| `supabase/functions/stripe-webhook` | Seule porte par laquelle un paiement active un droit. Signature vérifiée, chaque événement traité une seule fois. |
| `tests/test-schema.sh` | 79 tests de règles + 3 tests de concurrence (60 paiements simultanés pour 50 places, 20 inscriptions pour 5 places, 12 achats pour 3 pièces). |

Lancer les tests : `npm test` (règles, Node) et `npm run test:sql` (base, PostgreSQL local).

## Règles appliquées par le serveur

- **Founders** : place attribuée seulement quand le paiement d'une commande NC-01 est confirmé,
  dans l'ordre des confirmations, numéros 001 à 050, une place par client, jamais deux fois le
  même numéro (verrou + contraintes en base). Remboursement complet : le numéro est retiré, jamais
  redonné automatiquement ; l'administration peut le redonner à la main à un acheteur payé sans
  place (tracé). Si le client a une autre commande NC-01 payée, il garde sa place.
- **Abonnements** : actifs seulement après confirmation de Stripe. Un seul abonnement vivant par
  compte (index unique en base). Renouvellement annuel ; échec de paiement : 7 jours de grâce puis
  expiration. Une seule formule payante : Signature (CHF 59/an). Le Founders Club est gratuit et ne
  comprend pas les événements privés ; un fondateur peut prendre Signature en plus.
- **Accès anticipé** : la vente passe par `reserver_piece`, qui refuse un non-membre avant la date
  publique. Durée réglable par lancement. Stock décompté de façon atomique, pièce rendue si le
  paiement n'arrive pas en 30 minutes.
- **Événements** : inscription des membres Signature uniquement (fondateurs compris s'ils ont Signature), verrou sur la dernière place,
  liste d'attente qui avance automatiquement.
- **Carte imprimée** : une carte par catégorie et par compte, envoyée une fois (un renouvellement
  n'envoie rien ; un fondateur reçoit la carte Founders, même s'il a Signature). Fondateurs : dans le colis du
  cardigan. Une carte pas encore partie est annulée si le compte n'est plus membre. Jamais deux
  cartes en préparation pour un compte (index unique). Adresse en Suisse ou au Liechtenstein,
  lisible seulement par son titulaire et l'administration ; elle n'est jamais dans le QR code.
- **Clients** : ne peuvent rien écrire d'autre que leur nom et leur adresse d'envoi. Ni catégorie, ni abonnement, ni place.
- **Données bancaires** : jamais sur nos serveurs, uniquement chez Stripe.
- **QR code des cartes** : un jeton aléatoire de 32 caractères, sans donnée personnelle ; la page
  ouverte demande toujours la connexion.

## Mise en service (faite le 25.10.2026, mode test)

1. **Supabase** : projet `ejpzgvizznylfgzxngut` (offre gratuite). `supabase/schema.sql` puis
   `supabase/mise-a-jour-1.sql` collés dans SQL Editor. Connexion par e-mail, Site URL et
   Redirect URL `https://noatestutgstyr-beep.github.io/Nocelli/**`.
2. **Stripe** : compte en **mode test**, un seul produit, Signature Club 59 CHF par an.
3. **Secrets Supabase** (Edge Functions > Secrets) : `STRIPE_SECRET_KEY` (`sk_test_`),
   `STRIPE_PRIX_SIGNATURE`, `SITE_URL`, `STRIPE_WEBHOOK_SECRET`. La fonction refuse une clé réelle
   tant que `PAIEMENTS_REELS=oui` n'est pas posé.
4. **Fonctions** : mises en ligne par `.github/workflows/supabase-fonctions.yml` à chaque changement
   (secret GitHub `SUPABASE_ACCESS_TOKEN`). Webhook Stripe vers
   `https://ejpzgvizznylfgzxngut.supabase.co/functions/v1/stripe-webhook` (événements :
   `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.*`,
   `invoice.paid`, `charge.refunded`).
5. **Site** : `club/config.js` donne l'adresse du projet et la clé publique ; `club/serveur.js` remplace
   alors le serveur de test. Sans `config.js`, le club repasse en mode test.
6. **Tâches planifiées** (pg_cron, posées par `mise-a-jour-1.sql`) : `liberer_commandes_expirees()`
   toutes les 5 minutes, `synchroniser_envois()` chaque nuit.
7. **Administrateur** : après une première connexion, dans SQL Editor :
   `update public.profils set role = 'admin' where email = '<adresse>';`

Avant les vrais paiements : activer le compte Stripe, recréer le prix en mode réel, remplacer la clé
par `sk_live_` et poser `PAIEMENTS_REELS=oui` (avec l'accord de Noa), rédiger CGV et protection des
données.
