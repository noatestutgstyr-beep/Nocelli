// Recopie un abonnement Stripe dans la base (webhook, et vérification au retour du paiement).
import { baseService, PRIX, stripe } from './stripe.ts';

const STATUTS: Record<string, string> = {
  active: 'actif', trialing: 'actif', past_due: 'impaye', unpaid: 'impaye',
  canceled: 'expire', incomplete_expired: 'expire',
};
const PLAN_DE_PRIX = Object.fromEntries(Object.entries(PRIX).map(([plan, prix]) => [prix, plan]));

export async function synchroniser(db: ReturnType<typeof baseService>, evenementId: string, sub: any) {
  const statut = STATUTS[sub.status];
  if (!statut) return;                                   // 'incomplete' : pas encore payé
  const compte = sub.metadata?.compte_id;
  const plan = PLAN_DE_PRIX[sub.items.data[0].price.id] ?? sub.metadata?.plan;
  const { data: r, error } = await db.rpc('synchroniser_abonnement', {
    p_evenement: evenementId, p_compte: compte, p_stripe: sub.id, p_plan: plan, p_statut: statut,
    // Depuis l'API Stripe 2025-03-31, les dates de période sont sur l'article, plus sur l'abonnement.
    p_debut: new Date((sub.current_period_start ?? sub.items.data[0].current_period_start) * 1000).toISOString(),
    p_fin: new Date((sub.current_period_end ?? sub.items.data[0].current_period_end) * 1000).toISOString(),
    p_renouvellement: !sub.cancel_at_period_end,
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
}

