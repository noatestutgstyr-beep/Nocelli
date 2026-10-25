# Nocelli

Site de la marque Nocelli (Prima Edizione, 50 cardigans numérotés).

Site statique (HTML et CSS, sans outil payant). Les photos sont dans `img/`.
Publié gratuitement avec GitHub Pages depuis la branche `main`.

## NOCELLI PRIVATE CLUB

- `club.html` : présentation du club, les trois cartes, comparatif, questions fréquentes.
- `membre.html` : espace membre « My Membership » (carte numérique, abonnement, avant-premières, événements).
- `admin.html` : administration (membres, 50 fondateurs, lancements, événements, journal).
- `club/` : règles du club (`regles.js`), cartes (`cartes.js`, `cartes.css`), données (`donnees.js`).
  `club/impression.html` produit les cartes au format 85,6 × 54 mm.
- `backend/` : serveur prêt à brancher (Supabase + Stripe), voir `backend/LISEZMOI.md`.

Le club tourne en **mode test** tant que le serveur n'est pas branché : les données restent dans
le navigateur et aucun paiement n'est possible.

Tests : `npm test` (règles) et `npm run test:sql` (base de données, PostgreSQL local).
