import { NextResponse } from 'next/server';
import { empreinteAdmin, empreinteBienFormee } from '@/lib/auth/empreinte';
import { createToken, setSessionCookie, verifyPassword } from '@/lib/auth/session';
import { entreeParMotDePasse } from '@/lib/auth/secours';
import { fail, guard, ok } from '@/lib/api/respond';
import { loginSchema } from '@/lib/api/schemas';
import { LIMITS, reset } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';

/**
 * Une empreinte au bon format qui ne correspond à aucun mot de passe : sans
 * `ADMIN_PASSWORD_HASH`, on la vérifie quand même, pour que la réponse prenne
 * le même temps que la porte soit posée ou non.
 */
const LEURRE = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;

/** La session de secours, sans joueur derrière, ne dure qu'une heure. */
const DUREE_SECOURS_S = 60 * 60;

/**
 * Connexion par mot de passe — voir `lib/auth/secours.ts`.
 *
 * La limitation à 5 tentatives par quart d'heure et par adresse, et le coût de
 * scrypt, rendent le forçage impraticable. La réponse est identique, dans son
 * texte comme dans sa durée, que l'empreinte soit absente ou le mot de passe
 * faux : on ne renseigne pas un attaquant sur l'état de la configuration.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-login',
    limit: LIMITS.login,
    schema: loginSchema,
  });
  if (!g.ok) return g.response;

  const empreinte = empreinteAdmin();
  const utilisable = empreinte !== null && empreinteBienFormee(empreinte);
  if (empreinte && !utilisable) {
    // Visible dans les journaux de Vercel, jamais dans la réponse.
    console.error('[connexion] ADMIN_PASSWORD_HASH mal formée : attendu scrypt:<sel>:<clé>');
  }
  const valide = await verifyPassword(g.body.password, utilisable ? empreinte : LEURRE);

  if (!utilisable || !valide) {
    return fail('NON_AUTHENTIFIE', 'Mot de passe incorrect.');
  }

  // Connexion réussie : on relâche le compteur pour ne pas pénaliser l'admin.
  reset(`admin-login:${g.ip}`);
  const entree = await entreeParMotDePasse();
  await setSessionCookie(
    createToken(entree.sujet, 'admin', entree.secours ? DUREE_SECOURS_S : undefined),
    entree.secours ? DUREE_SECOURS_S : undefined,
  );
  return ok({ role: 'admin', secours: entree.secours });
}
