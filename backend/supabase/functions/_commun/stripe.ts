// Petit client Stripe sans dépendance (API REST). La clé secrète vit uniquement
// dans les secrets Supabase, jamais dans le site. Les données bancaires restent chez
// Stripe : le site et la base ne voient jamais un numéro de carte.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
export const PRIX: Record<string, string> = {
  signature: Deno.env.get('STRIPE_PRIX_SIGNATURE') ?? '',  // 59 CHF / an
};
// Adresse du site sans « / » final (SITE_URL peut en avoir un).
export const SITE = (Deno.env.get('SITE_URL') ?? 'https://nocelli.ch').replace(/\/+$/, '');

if (STRIPE_SECRET && !STRIPE_SECRET.startsWith('sk_test_') && Deno.env.get('PAIEMENTS_REELS') !== 'oui') {
  // Sécurité : tant que Noa n'a pas dit oui, seule une clé de TEST est acceptée.
  throw new Error('Clé Stripe réelle refusée : mettre PAIEMENTS_REELS=oui seulement au lancement.');
}

function formulaire(obj: Record<string, unknown>, prefixe = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (typeof v === 'object') out.push(...formulaire(v as Record<string, unknown>, cle));
    else out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripe(methode: 'GET' | 'POST' | 'DELETE', chemin: string, corps?: Record<string, unknown>, idempotence?: string) {
  const r = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotence ? { 'Idempotency-Key': idempotence } : {}),
    },
    body: corps ? formulaire(corps).join('&') : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message ?? `Stripe ${r.status}`);
  return json;
}

// Client « service » : réservé aux fonctions serveur, contourne la RLS.
export function baseService() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

// Personne connectée, lue dans son jeton de session (vérifié par Supabase Auth).
export async function utilisateur(req: Request) {
  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jeton) return null;
  const { data, error } = await baseService().auth.getUser(jeton);
  return error ? null : data.user;
}

export const CORS = {
  'Access-Control-Allow-Origin': new URL(SITE).origin,   // le navigateur envoie l'origine sans chemin
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function reponse(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
