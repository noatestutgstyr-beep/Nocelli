// Webhook Stripe : la seule porte par laquelle un paiement active un droit.
// Signature vérifiée, chaque événement traité une seule fois (table webhooks_traites).
// À déployer sans vérification JWT : supabase functions deploy stripe-webhook --no-verify-jwt
import { baseService, PRIX, stripe } from '../_commun/stripe.ts';

const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

async function signatureValide(corps: string, entete: string | null) {
  if (!entete || !SECRET) return false;
  const parts = Object.fromEntries(entete.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;          // rejoué trop tard
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`${t}.${corps}`));
  const attendu = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const recus = entete.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return recus.some((v) => v.length === attendu.length && [...v].every((ch, i) => ch === attendu[i]));
}

const STATUTS: Record<string, string> = {
  active: 'actif', trialing: 'actif', past_due: 'impaye', unpaid: 'impaye',
  canceled: 'expire', incomplete_expired: 'expire',
};
const PLAN_DE_PRIX = Object.fromEntries(Object.entries(PRIX).map(([plan, prix]) => [prix, plan]));

async function synchroniser(db: ReturnType<typeof baseService>, evenementId: string, sub: any) {
  const statut = STATUTS[sub.status];
  if (!statut) return;                                   // 'incomplete' : pas encore payé
  const compte = sub.metadata?.compte_id;
  const plan = PLAN_DE_PRIX[sub.items.data[0].price.id] ?? sub.metadata?.plan;
  const { data: r, error } = await db.rpc('synchroniser_abonnement', {
    p_evenement: evenementId, p_compte: compte, p_stripe: sub.id, p_plan: plan, p_statut: statut,
    p_debut: new Date(sub.current_period_start * 1000).toISOString(),
    p_fin: new Date(sub.current_period_end * 1000).toISOString(),
    p_renouvellement: !sub.cancel_at_period_end,
    p_plan_suivant: sub.metadata?.plan_au_renouvellement || null,
  });
  if (error) throw error;
  if (r === 'doublon_a_rembourser') {
    // Deuxième abonnement pour le même compte : arrêté tout de suite et remboursé.
    await stripe('DELETE', `subscriptions/${sub.id}`);
    if (sub.latest_invoice) {
      const inv = await stripe('GET', `invoices/${sub.latest_invoice}`);
      if (inv.payment_intent) await stripe('POST', 'refunds', { payment_intent: inv.payment_intent }, `refund-${sub.id}`);
    }
  }
  // Un fondateur ne paie jamais de renouvellement.
  const { data: verdict } = await db.rpc('peut_souscrire', { p_compte: compte, p_plan: plan });
  if (verdict === 'deja_fondateur' && !sub.cancel_at_period_end && statut === 'actif') {
    await stripe('POST', `subscriptions/${sub.id}`, { cancel_at_period_end: true });
  }
}

Deno.serve(async (req) => {
  const corps = await req.text();
  if (!(await signatureValide(corps, req.headers.get('stripe-signature')))) {
    return new Response('signature invalide', { status: 400 });
  }
  const evt = JSON.parse(corps);
  const db = baseService();
  const o = evt.data.object;
  try {
    switch (evt.type) {
      case 'checkout.session.completed':
        if (o.mode === 'payment' && o.payment_status === 'paid' && o.metadata?.commande_id) {
          // Attribue la place fondateur si c'est un cardigan NC-01 (sous verrou, en base).
          const { error } = await db.rpc('confirmer_paiement_commande', { p_commande: o.metadata.commande_id, p_evenement: evt.id });
          if (error) throw error;
        }
        if (o.mode === 'subscription' && o.subscription) {
          await synchroniser(db, evt.id, await stripe('GET', `subscriptions/${o.subscription}`));
        }
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await synchroniser(db, evt.id, o);
        break;
      case 'invoice.paid':
        if (o.subscription) {
          const sub = await stripe('GET', `subscriptions/${o.subscription}`);
          await db.rpc('enregistrer_paiement', {
            p_id: o.id, p_compte: sub.metadata?.compte_id, p_stripe_abonnement: o.subscription,
            p_montant: o.amount_paid / 100,
            p_type: o.billing_reason === 'subscription_create' ? 'adhesion'
              : o.billing_reason === 'subscription_update' ? 'passage_signature' : 'renouvellement',
          });
        }
        break;
      case 'invoice.upcoming':
        // Passage Signature -> Early Access demandé : appliqué juste avant le renouvellement.
        if (o.subscription) {
          const sub = await stripe('GET', `subscriptions/${o.subscription}`);
          const suivant = sub.metadata?.plan_au_renouvellement;
          if (suivant && PRIX[suivant]) {
            await stripe('POST', `subscriptions/${sub.id}`, {
              items: { 0: { id: sub.items.data[0].id, price: PRIX[suivant] } },
              proration_behavior: 'none',
              metadata: { plan: suivant, plan_au_renouvellement: '' },
            });
          }
        }
        break;
      case 'checkout.session.expired':
        if (o.metadata?.commande_id) await db.rpc('liberer_commandes_expirees');
        break;
      case 'charge.refunded':
        if (o.refunded && o.payment_intent) {
          // Remboursement total uniquement ; la commande est retrouvée par le paiement.
          const pi = await stripe('GET', `payment_intents/${o.payment_intent}`);
          if (pi.metadata?.commande_id) {
            await db.rpc('fermer_commande', { p_commande: pi.metadata.commande_id, p_statut: 'remboursee', p_evenement: evt.id });
          }
        }
        break;
    }
  } catch (e) {
    console.error(evt.type, e);
    return new Response('erreur', { status: 500 });     // Stripe réessaiera
  }
  return new Response('ok');
});
