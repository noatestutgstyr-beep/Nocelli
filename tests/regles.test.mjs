// Tests des règles essentielles du NOCELLI PRIVATE CLUB.
// Lancer : npm test   (ou : node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../club/regles.js');

const T0 = Date.UTC(2026, 10, 25, 18, 0, 0); // ouverture NC-01
const J = R.JOUR, H = R.HEURE;

function client(etat, n) {
  return R.trouverOuCreerCompte(etat, `client${n}@exemple.ch`, `Client ${n}`, T0);
}
function commande(etat, compteId, produit = 'NC-01') {
  const c = { id: R.nouvelId(etat, 'cmd'), compteId, produit, quantite: 1, taille: 'M', statut: 'en_attente', creeLe: T0 };
  etat.commandes[c.id] = c;
  return c;
}
function abonner(etat, compteId, plan, now = T0) {
  const a = R.demarrerAbonnement(etat, compteId, plan, now);
  R.confirmerPaiementAbonnement(etat, a.id, 'evt_' + a.id, now);
  return a;
}

/* ---------- Comptes ---------- */

test('une adresse e-mail = un seul compte (pas de doublon, casse ignorée)', () => {
  const e = R.etatVide();
  const a = R.trouverOuCreerCompte(e, 'Luca@Exemple.ch', 'Luca', T0);
  const b = R.trouverOuCreerCompte(e, ' luca@exemple.ch ', '', T0);
  assert.equal(a.id, b.id);
  assert.equal(Object.keys(e.comptes).length, 1);
});

/* ---------- Founders Club ---------- */

test('une commande impayée ne donne aucune place fondateur', () => {
  const e = R.etatVide();
  const c = commande(e, client(e, 1).id);
  assert.equal(R.attribuerPlaceFondateur(e, c.id, T0).attribue, false);
  assert.equal(R.nombreFondateurs(e), 0);
});

test('les 50 premiers paiements NC-01 reçoivent 001 à 050, jamais plus de 50', () => {
  const e = R.etatVide();
  const res = [];
  for (let i = 1; i <= 60; i++) {
    const c = commande(e, client(e, i).id);
    res.push(R.confirmerPaiementCommande(e, c.id, T0 + i).fondateur);
  }
  assert.equal(R.nombreFondateurs(e), 50);
  const numeros = res.filter(r => r.attribue).map(r => r.place.numero);
  assert.deepEqual(numeros, Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(new Set(numeros).size, 50, 'aucun numéro en double');
  assert.ok(res.slice(50).every(r => r.raison === 'complet'));
});

test('un client qui achète plusieurs cardigans n’a qu’une seule place', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  const c1 = commande(e, cpt.id), c2 = commande(e, cpt.id);
  R.confirmerPaiementCommande(e, c1.id, T0);
  const r2 = R.confirmerPaiementCommande(e, c2.id, T0 + 1);
  assert.equal(r2.fondateur.raison, 'deja_fondateur');
  assert.equal(R.nombreFondateurs(e), 1);
  const suivant = commande(e, client(e, 2).id);
  assert.equal(R.confirmerPaiementCommande(e, suivant.id, T0 + 2).fondateur.place.numero, 2);
});

test('un autre produit ne donne pas de place fondateur', () => {
  const e = R.etatVide();
  const c = commande(e, client(e, 1).id, 'NC-02');
  assert.equal(R.confirmerPaiementCommande(e, c.id, T0).fondateur.attribue, false);
});

test('un paiement confirmé deux fois (webhook rejoué) ne donne pas deux numéros', () => {
  const e = R.etatVide();
  const c = commande(e, client(e, 1).id);
  R.confirmerPaiementCommande(e, c.id, T0);
  const r = R.confirmerPaiementCommande(e, c.id, T0 + 5);
  assert.equal(r.dejaPayee, true);
  assert.equal(e.compteurs.fondateur, 2);
});

test('remboursement : le numéro est retiré et jamais redonné automatiquement', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ca = commande(e, a.id);
  R.confirmerPaiementCommande(e, ca.id, T0);
  const r = R.rembourserCommande(e, ca.id, 'remboursee', T0 + J);
  assert.equal(r.retiree, true);
  assert.equal(e.fondateurs[1].statut, 'retire');
  assert.equal(R.droits(e, a.id, T0 + J).membre, false);
  const cb = commande(e, client(e, 2).id);
  assert.equal(R.confirmerPaiementCommande(e, cb.id, T0 + 2 * J).fondateur.place.numero, 2, 'le n° 1 n’est pas réutilisé');
});

test('remboursement d’un des deux cardigans : le client garde son numéro', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const c1 = commande(e, a.id), c2 = commande(e, a.id);
  R.confirmerPaiementCommande(e, c1.id, T0);
  R.confirmerPaiementCommande(e, c2.id, T0 + 1);
  const r = R.rembourserCommande(e, c1.id, 'remboursee', T0 + J);
  assert.equal(r.transferee, true);
  assert.equal(R.placeFondateur(e, a.id).numero, 1);
  assert.equal(R.placeFondateur(e, a.id).commandeId, c2.id);
});

test('l’administration peut redonner un numéro retiré, seulement à un acheteur payé sans place', () => {
  const e = R.etatVide();
  const a = client(e, 1), b = client(e, 2), z = client(e, 3);
  const ca = commande(e, a.id);
  R.confirmerPaiementCommande(e, ca.id, T0);
  for (let i = 4; i <= 52; i++) R.confirmerPaiementCommande(e, commande(e, client(e, i).id).id, T0 + i);
  const cb = commande(e, b.id);
  R.confirmerPaiementCommande(e, cb.id, T0 + 100); // 51e acheteur : complet
  assert.equal(R.placeFondateur(e, b.id), null);
  R.rembourserCommande(e, ca.id, 'remboursee', T0 + J);
  assert.throws(() => R.reattribuerNumeroRetire(e, 1, z.id, T0 + J), /pas de commande NC-01 payée/);
  const f = R.reattribuerNumeroRetire(e, 1, b.id, T0 + J);
  assert.equal(f.compteId, b.id);
  assert.equal(R.nombreFondateurs(e), 50);
  assert.throws(() => R.reattribuerNumeroRetire(e, 2, b.id, T0 + J), /n'est pas retiré/);
});

test('le Founders Club ne s’achète jamais, et Early Access n’existe plus', () => {
  const e = R.etatVide();
  assert.throws(() => R.demarrerAbonnement(e, client(e, 1).id, 'founders', T0), /ne se vend pas/);
  assert.throws(() => R.demarrerAbonnement(e, client(e, 1).id, 'early', T0), /Formule inconnue/);
  assert.deepEqual(Object.keys(R.CATEGORIES), ['founders', 'signature']);
});

test('fondateur : avant-premières, votes et contenus à vie, mais pas les événements privés', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  R.confirmerPaiementCommande(e, commande(e, a.id).id, T0);
  const d = R.droits(e, a.id, T0 + 3650 * J);
  assert.equal(d.categorie, 'founders');
  assert.ok(d.accesAnticipe && d.votes && d.contenus);
  assert.equal(d.evenements, false);
  assert.equal(d.experiences, false);
});

test('un fondateur peut prendre Signature pour les événements, et garde son statut', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  R.confirmerPaiementCommande(e, commande(e, a.id).id, T0);
  const ab = abonner(e, a.id, 'signature', T0 + J);
  const d = R.droits(e, a.id, T0 + 2 * J);
  assert.equal(d.categorie, 'founders');
  assert.equal(d.evenements, true);
  assert.equal(ab.renouvellementAuto, true, 'Signature se renouvelle normalement');
  R.annulerRenouvellement(e, a.id, T0 + 2 * J);
  const apres = R.droits(e, a.id, ab.fin + J);
  assert.equal(apres.categorie, 'founders', 'Signature échue : toujours fondateur');
  assert.equal(apres.evenements, false);
});

/* ---------- Abonnements ---------- */

test('l’abonnement n’est actif qu’après confirmation du paiement', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = R.demarrerAbonnement(e, a.id, 'signature', T0);
  assert.equal(R.droits(e, a.id, T0).membre, false);
  R.confirmerPaiementAbonnement(e, ab.id, 'evt_1', T0);
  assert.equal(R.droits(e, a.id, T0).categorie, 'signature');
  assert.equal(ab.fin, Date.UTC(2027, 10, 25, 18, 0, 0), 'un an exactement');
});

test('pas de double abonnement actif, pas de double paiement', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = R.demarrerAbonnement(e, a.id, 'signature', T0);
  assert.equal(R.demarrerAbonnement(e, a.id, 'signature', T0 + 1000).id, ab.id, 'même paiement repris');
  R.confirmerPaiementAbonnement(e, ab.id, 'evt_1', T0);
  R.confirmerPaiementAbonnement(e, ab.id, 'evt_1', T0 + 5); // webhook rejoué
  assert.equal(e.paiements.length, 1);
  assert.throws(() => R.demarrerAbonnement(e, a.id, 'signature', T0 + J), /déjà membre Signature/);
});

test('deux paiements en parallèle : un seul abonnement est activé, l’autre est à rembourser', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const x = R.demarrerAbonnement(e, a.id, 'signature', T0);
  const t = T0 + R.ATTENTE_PAIEMENT + 1;
  const y = R.demarrerAbonnement(e, a.id, 'signature', t); // x abandonné après 30 min, nouveau paiement
  assert.notEqual(x.id, y.id);
  R.confirmerPaiementAbonnement(e, y.id, 'evt_y', t + 1);
  const r = R.confirmerPaiementAbonnement(e, x.id, 'evt_x', t + 2); // le premier paiement arrive quand même
  assert.equal(r.aRembourser, true);
  assert.equal(R.droits(e, a.id, t + 3).categorie, 'signature');
});

test('renouvellement : la nouvelle année part de l’ancienne échéance', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = abonner(e, a.id, 'signature');
  const fin1 = ab.fin;
  R.confirmerPaiementAbonnement(e, ab.id, 'evt_renew', fin1 + H);
  assert.equal(ab.debut, fin1);
  assert.equal(ab.fin, Date.UTC(2028, 10, 25, 18, 0, 0));
  assert.equal(e.paiements.at(-1).type, 'renouvellement');
});

test('échec de paiement au renouvellement : 7 jours de grâce, puis expiration', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = abonner(e, a.id, 'signature');
  R.echecPaiementAbonnement(e, ab.id, 'evt_fail', ab.fin);
  assert.equal(R.droits(e, a.id, ab.fin + 3 * J).membre, true, 'encore membre pendant la grâce');
  assert.equal(R.droits(e, a.id, ab.fin + 8 * J).membre, false);
  assert.equal(ab.statut, 'expire');
});

test('échec du premier paiement : rien n’est activé', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = R.demarrerAbonnement(e, a.id, 'signature', T0);
  R.echecPaiementAbonnement(e, ab.id, 'evt_f', T0 + 1000);
  assert.equal(ab.statut, 'echoue');
  assert.equal(R.droits(e, a.id, T0 + 2000).membre, false);
  assert.ok(R.demarrerAbonnement(e, a.id, 'signature', T0 + 3000), 'peut réessayer');
});

test('annuler le renouvellement : accès gardé jusqu’à l’échéance, puis expiré', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = abonner(e, a.id, 'signature');
  R.annulerRenouvellement(e, a.id, T0 + 10 * J);
  assert.equal(R.droits(e, a.id, ab.fin - J).categorie, 'signature');
  assert.equal(R.droits(e, a.id, ab.fin + 1).membre, false);
  assert.equal(ab.statut, 'expire');
});

test('un client ne peut pas se donner une catégorie qu’il n’a pas payée', () => {
  const e = R.etatVide();
  const a = client(e, 1);
  const ab = R.demarrerAbonnement(e, a.id, 'signature', T0);
  assert.equal(R.droits(e, a.id, T0).membre, false);
  // Le seul chemin vers « actif » est la confirmation du prestataire de paiement.
  assert.throws(() => R.annulerRenouvellement(e, a.id, T0), /Aucun abonnement/);
  assert.equal(ab.statut, 'en_attente');
});

/* ---------- Accès anticipé ---------- */

function lancement(e, heures = 48) {
  const l = { id: 'lan_1', nom: 'NC-02', produit: 'NC-02', publicLe: T0 + 10 * J, heuresAnticipees: heures, stock: { S: 1, M: 2, L: 0 }, publie: true };
  e.lancements[l.id] = l;
  return l;
}

test('accès anticipé : 48 h avant pour Founders et Signature, jamais pour les non-membres', () => {
  const e = R.etatVide();
  const l = lancement(e);
  const visiteur = client(e, 1), sig = client(e, 3), fond = client(e, 4);
  abonner(e, sig.id, 'signature');
  R.confirmerPaiementCommande(e, commande(e, fond.id).id, T0);
  const avant = l.publicLe - 49 * H, pendant = l.publicLe - 47 * H;
  for (const c of [visiteur, sig, fond]) assert.equal(R.peutAcheter(e, c.id, l.id, 'M', avant).ok, false);
  assert.equal(R.peutAcheter(e, visiteur.id, l.id, 'M', pendant).raison, 'reserve_membres');
  assert.equal(R.peutAcheter(e, null, l.id, 'M', pendant).raison, 'reserve_membres');
  for (const c of [sig, fond]) assert.equal(R.peutAcheter(e, c.id, l.id, 'M', pendant).ok, true);
  assert.equal(R.peutAcheter(e, visiteur.id, l.id, 'M', l.publicLe).ok, true);
});

test('la durée d’accès anticipé est réglable par lancement', () => {
  const e = R.etatVide();
  const l = lancement(e, 24);
  const m = client(e, 1); abonner(e, m.id, 'signature');
  assert.equal(R.peutAcheter(e, m.id, l.id, 'M', l.publicLe - 30 * H).ok, false);
  assert.equal(R.peutAcheter(e, m.id, l.id, 'M', l.publicLe - 20 * H).ok, true);
});

test('le stock est limité et une commande impayée rend sa pièce', () => {
  const e = R.etatVide();
  const l = lancement(e);
  const a = client(e, 1), b = client(e, 2);
  const now = l.publicLe;
  R.reserverPiece(e, a.id, l.id, 'S', now);
  assert.throws(() => R.reserverPiece(e, b.id, l.id, 'S', now), /épuisée/);
  assert.throws(() => R.reserverPiece(e, b.id, l.id, 'L', now), /épuisée/);
  R.libererCommandesExpirees(e, now + R.ATTENTE_PAIEMENT + 1);
  assert.equal(l.stock.S, 1);
  assert.ok(R.reserverPiece(e, b.id, l.id, 'S', now + R.ATTENTE_PAIEMENT + 2));
});

test('un membre suspendu par l’administration perd ses droits', () => {
  const e = R.etatVide();
  const l = lancement(e);
  const m = client(e, 1); abonner(e, m.id, 'signature');
  m.suspendu = true;
  assert.equal(R.peutAcheter(e, m.id, l.id, 'M', l.publicLe - H).ok, false);
});

/* ---------- Événements ---------- */

function evenement(e, capacite = 2) {
  const ev = { id: 'evt_a', titre: 'Présentation', date: T0 + 30 * J, lieu: 'Lugano', capacite, prix: 0, publie: true, annule: false };
  e.evenements[ev.id] = ev;
  return ev;
}

test('événements : seuls les membres Signature s’inscrivent, fondateurs compris s’ils ont Signature', () => {
  const e = R.etatVide();
  const ev = evenement(e, 10);
  const sig = client(e, 1), fond = client(e, 2), fondSig = client(e, 3), vis = client(e, 4);
  abonner(e, sig.id, 'signature');
  R.confirmerPaiementCommande(e, commande(e, fond.id).id, T0);
  R.confirmerPaiementCommande(e, commande(e, fondSig.id).id, T0);
  abonner(e, fondSig.id, 'signature');
  assert.throws(() => R.inscrireEvenement(e, fond.id, ev.id, T0), /réservés aux membres Signature/);
  assert.throws(() => R.inscrireEvenement(e, vis.id, ev.id, T0), /réservés aux membres Signature/);
  assert.equal(R.inscrireEvenement(e, sig.id, ev.id, T0).statut, 'confirme');
  assert.equal(R.inscrireEvenement(e, fondSig.id, ev.id, T0).statut, 'confirme');
});

test('événement complet : liste d’attente, puis promotion quand une place se libère', () => {
  const e = R.etatVide();
  const ev = evenement(e, 1);
  const a = client(e, 1), b = client(e, 2);
  abonner(e, a.id, 'signature'); abonner(e, b.id, 'signature');
  R.inscrireEvenement(e, a.id, ev.id, T0);
  assert.equal(R.inscrireEvenement(e, b.id, ev.id, T0 + 1).statut, 'attente');
  assert.equal(R.inscrireEvenement(e, b.id, ev.id, T0 + 2).statut, 'attente', 'pas de double inscription');
  assert.equal(R.placesRestantes(e, ev.id), 0);
  const r = R.annulerInscription(e, a.id, ev.id, T0 + 3);
  assert.equal(r.promu.compteId, b.id);
  assert.equal(R.placesRestantes(e, ev.id), 0);
});

/* ---------- Tableau de bord ---------- */

test('statistiques : membres par catégorie et revenus', () => {
  const e = R.etatVide();
  abonner(e, client(e, 1).id, 'signature');
  const f = client(e, 2);
  R.confirmerPaiementCommande(e, commande(e, f.id).id, T0);
  abonner(e, f.id, 'signature');
  R.confirmerPaiementCommande(e, commande(e, client(e, 3).id).id, T0);
  const s = R.statistiques(e, T0 + J);
  assert.equal(s.signature, 2); assert.equal(s.founders, 2); assert.equal(s.fondateursSignature, 1);
  assert.equal(s.fondateursRestants, 48);
  assert.equal(s.revenuAnnuel, 118);
  assert.equal(s.encaisse, 118);
});

/* ---------- Carte physique envoyée par la poste ---------- */

const ADRESSE = { nom: 'Luca Rossi', rue: 'Via Nassa 12', npa: '6900', localite: 'Lugano', pays: 'CH' };

test('un nouvel abonné attend sa carte ; elle est prête dès que l’adresse est donnée', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  assert.equal(R.synchroniserEnvoi(e, cpt.id, T0), null, 'pas membre : pas de carte');
  abonner(e, cpt.id, 'signature');
  const env = R.synchroniserEnvoi(e, cpt.id, T0);
  assert.equal(env.statut, 'adresse_manquante');
  assert.equal(env.mode, 'poste');
  assert.equal(env.numero, cpt.numeroMembre);
  R.enregistrerAdresse(e, cpt.id, ADRESSE);
  assert.equal(env.statut, 'a_preparer');
  assert.equal(R.synchroniserEnvoi(e, cpt.id, T0).id, env.id, 'pas de second envoi');
});

test('adresse refusée si incomplète ou hors Suisse / Liechtenstein', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  assert.throws(() => R.enregistrerAdresse(e, cpt.id, { ...ADRESSE, npa: '690' }), { code: 'adresse' });
  assert.throws(() => R.enregistrerAdresse(e, cpt.id, { ...ADRESSE, pays: 'FR' }), { code: 'pays' });
  assert.equal(R.enregistrerAdresse(e, cpt.id, { ...ADRESSE, pays: 'li', npa: '9490', localite: 'Vaduz' }).pays, 'LI');
});

test('le fondateur reçoit sa carte dans le colis du cardigan, sans timbre', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  R.confirmerPaiementCommande(e, commande(e, cpt.id).id, T0);
  const env = R.synchroniserEnvoi(e, cpt.id, T0);
  assert.equal(env.categorie, 'founders');
  assert.equal(env.mode, 'colis');
  assert.equal(env.numero, 1);
  const c = R.COUTS_CARTE;
  assert.equal(R.coutEnvoi(env), Math.round((c.carte + c.numero) * 100) / 100);
  assert.ok(R.coutEnvoi({ mode: 'poste' }) > R.coutEnvoi(env));
});

test('la carte n’est envoyée qu’une fois : un renouvellement n’en renvoie pas', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  R.enregistrerAdresse(e, cpt.id, ADRESSE);
  abonner(e, cpt.id, 'signature');
  const env = R.synchroniserEnvoi(e, cpt.id, T0);
  R.marquerCarteEnvoyee(e, env.id, T0 + H);
  assert.equal(env.statut, 'envoyee');
  assert.deepEqual(env.adresse, { ...ADRESSE, complement: '' });
  assert.throws(() => R.marquerCarteEnvoyee(e, env.id, T0 + H), { code: 'deja' });
  // Un an plus tard, renouvellement payé : toujours une seule carte.
  R.synchroniserEnvoi(e, cpt.id, T0 + 400 * J);
  assert.equal(R.envoisDe(e, cpt.id).length, 1);
});

test('abonné Signature devenu fondateur avant l’envoi : il reçoit la carte Founders à la place', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  R.enregistrerAdresse(e, cpt.id, ADRESSE);
  abonner(e, cpt.id, 'signature');
  const sig = R.synchroniserEnvoi(e, cpt.id, T0);
  R.confirmerPaiementCommande(e, commande(e, cpt.id).id, T0 + J);
  const fond = R.synchroniserEnvoi(e, cpt.id, T0 + J);
  assert.equal(sig.statut, 'annulee');
  assert.equal(sig.motif, 'remplacee');
  assert.equal(fond.categorie, 'founders');
  assert.equal(fond.mode, 'colis');
});

test('fondateur remboursé avant l’envoi : sa carte n’est pas envoyée', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  const cmd = commande(e, cpt.id);
  R.confirmerPaiementCommande(e, cmd.id, T0);
  const env = R.synchroniserEnvoi(e, cpt.id, T0);
  R.rembourserCommande(e, cmd.id, 'remboursee', T0 + H);
  R.synchroniserEnvoi(e, cpt.id, T0 + H);
  assert.equal(env.statut, 'annulee');
  assert.equal(env.motif, 'plus_membre');
  assert.throws(() => R.marquerCarteEnvoyee(e, env.id, T0 + H), { code: 'pas_pret' });
});

test('carte perdue : une seule nouvelle carte à la fois, par la poste', () => {
  const e = R.etatVide();
  const cpt = client(e, 1);
  R.enregistrerAdresse(e, cpt.id, ADRESSE);
  R.confirmerPaiementCommande(e, commande(e, cpt.id).id, T0);
  const env = R.synchroniserEnvoi(e, cpt.id, T0);
  assert.throws(() => R.remplacerCarte(e, cpt.id, T0), { code: 'en_cours' });
  R.marquerCarteEnvoyee(e, env.id, T0);
  const neuve = R.remplacerCarte(e, cpt.id, T0 + J);
  assert.equal(neuve.mode, 'poste');
  assert.equal(neuve.numero, 1);
  assert.equal(neuve.motif, 'remplacement');
  assert.equal(R.synchroniserEnvoi(e, cpt.id, T0 + J).id, env.id, 'la synchronisation ne crée rien de plus');
  assert.equal(R.envoisDe(e, cpt.id).length, 2);
});
