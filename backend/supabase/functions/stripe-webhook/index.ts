// Webhook Stripe : la seule porte par laquelle un paiement active un droit.
// Signature vérifiée, chaque événement traité une seule fois (table webhooks_traites).
// À déployer sans vérification JWT : supabase functions deploy stripe-webhook --no-verify-jwt
import { baseService, stripe } from '../_commun/stripe.ts';
import { synchroniser } from '../_commun/abonnement.ts';

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
            p_type: o.billing_reason === 'subscription_create' ? 'adhesion' : 'renouvellement',
          });
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
