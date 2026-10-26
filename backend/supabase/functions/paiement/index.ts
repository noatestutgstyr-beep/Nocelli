// Ouvre un paiement Stripe ou modifie l'abonnement de la personne connectée.
// Corps JSON : { action: 'souscrire', plan: 'signature' }
//            | { action: 'annuler_renouvellement' } | { action: 'reprendre_renouvellement' }
//            | { action: 'acheter', commande_id }   (commande créée par reserver_piece)
// Rien n'est activé ici : seule la confirmation de Stripe (webhook) active un droit.
import { baseService, CORS, PRIX, reponse, SITE, stripe, utilisateur } from '../_commun/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const user = await utilisateur(req);
  if (!user) return reponse({ erreur: 'connexion_requise' }, 401);
  const service = baseService();
  const corps = await req.json().catch(() => ({}));

  try {
    if (corps.action === 'souscrire') {
      const { data: verdict } = await service.rpc('peut_souscrire', { p_compte: user.id, p_plan: corps.plan });
      if (verdict !== 'ok') return reponse({ erreur: verdict }, 409);
      const session = await stripe('POST', 'checkout/sessions', {
        mode: 'subscription',
        line_items: { 0: { price: PRIX[corps.plan], quantity: 1 } },
        customer_email: user.email,
        client_reference_id: user.id,
        subscription_data: { metadata: { compte_id: user.id, plan: corps.plan } },
        metadata: { compte_id: user.id, plan: corps.plan },
        // Twint et cartes, selon ce qui est activé dans Stripe.
        success_url: `${SITE}/membre.html?paiement=ok`,
        cancel_url: `${SITE}/club.html?paiement=annule`,
        locale: 'fr',
      }, `souscrire-${user.id}-${crypto.randomUUID()}`);   // un essai = une clé (une clé réutilisée avec d'autres paramètres est refusée par Stripe)
      return reponse({ url: session.url });
    }

    if (corps.action === 'acheter') {
      // La commande doit appartenir à la personne et réserve déjà la pièce.
      const { data: cmd } = await service.from('commandes').select('*').eq('id', corps.commande_id).eq('compte_id', user.id).maybeSingle();
      if (!cmd || cmd.statut !== 'en_attente') return reponse({ erreur: 'commande_invalide' }, 409);
      const { data: lan } = await service.from('lancements').select('nom, prix').eq('id', cmd.lancement_id).single();
      const session = await stripe('POST', 'checkout/sessions', {
        mode: 'payment',
        line_items: { 0: { quantity: 1, price_data: { currency: 'chf', unit_amount: Math.round(lan.prix * 100), product_data: { name: `${lan.nom} · taille ${cmd.taille}` } } } },
        customer_email: user.email,
        client_reference_id: user.id,
        metadata: { commande_id: cmd.id },
        payment_intent_data: { metadata: { commande_id: cmd.id } },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,   // la pièce est rendue après 30 min
        success_url: `${SITE}/membre.html?commande=ok`,
        cancel_url: `${SITE}/membre.html?commande=annulee`,
        locale: 'fr',
      }, `acheter-${cmd.id}`);
      await service.from('commandes').update({ stripe_session: session.id }).eq('id', cmd.id);
      return reponse({ url: session.url });
    }

    // Les autres actions portent sur l'abonnement vivant de la personne.
    const { data: ab } = await service.from('abonnements').select('*').eq('compte_id', user.id).in('statut', ['actif', 'impaye']).maybeSingle();
    if (!ab) return reponse({ erreur: 'pas_abonne' }, 409);
    const sub = await stripe('GET', `subscriptions/${ab.stripe_abonnement}`);

    if (corps.action === 'annuler_renouvellement' || corps.action === 'reprendre_renouvellement') {
      await stripe('POST', `subscriptions/${sub.id}`, { cancel_at_period_end: corps.action === 'annuler_renouvellement' });
      return reponse({ ok: true });
    }
    return reponse({ erreur: 'action_inconnue' }, 400);
  } catch (e) {
    console.error('paiement', corps.action, e);
    return reponse({ erreur: String((e as Error).message) }, 502);
  }
});
