import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, ok } from '@/lib/api/respond';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import {
  analyseCapture,
  isReconnaissanceEnabled,
  MEDIA_TYPES,
} from '@/lib/services/reconnaissance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Une capture réduite côté client fait quelques centaines de Ko ; 8 Mo laissent de la marge. */
const TAILLE_MAX = 8 * 1024 * 1024;

const analyseSchema = z.object({
  /** Le contenu de l'image en base64, sans préfixe `data:`. */
  image: z
    .string()
    .min(64, 'Image vide.')
    .max(Math.ceil((TAILLE_MAX * 4) / 3), 'Image trop lourde (8 Mo maximum).')
    .regex(/^[A-Za-z0-9+/]+=*$/, 'Image illisible.'),
  mediaType: z.enum(MEDIA_TYPES),
});

/**
 * Lecture d'une capture de fin de game par la modération.
 *
 * Ne modifie rien : la réponse est une proposition, que la modération
 * enregistre ensuite game par game via `/api/games`. C'est donc cette route
 * là, et son schéma, qui reste l'autorité sur les kills et le classement.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-analyse',
    role: 'moderateur',
    // Chaque appel coûte : un barème serré, bien en dessous des écritures.
    limit: { limit: 20, windowMs: 60_000 },
    schema: analyseSchema,
    // L'image voyage en base64 : un tiers de plus que ses octets.
    corpsMax: Math.ceil((TAILLE_MAX * 4) / 3) + 4096,
  });
  if (!g.ok) return g.response;

  if (!isReconnaissanceEnabled()) {
    // Rien sur la configuration dans la réponse : elle se lit dans les journaux du serveur.
    return fail('INTROUVABLE', 'La reconnaissance des captures n’est pas activée.');
  }

  const chaine = chaineDeLaLigue();
  const { joueurs, streameuse } = await getStore().read((db) => {
    const connu = (p: (typeof db.players)[number]) => ({
      id: p.id,
      pseudo: p.pseudo,
      activisionId: p.activisionId,
      twitchLogin: p.twitchLogin,
    });
    const elle = db.players.find((p) => estLaStreameuse(p, chaine));
    return {
      // La streameuse n'est jamais proposée : ses lignes sont reconnues à part.
      joueurs: db.players.filter((p) => p.active && !estLaStreameuse(p, chaine)).map(connu),
      streameuse: elle ? connu(elle) : { id: '', pseudo: chaine, activisionId: null, twitchLogin: chaine },
    };
  });

  try {
    const analyse = await analyseCapture(g.body.image, g.body.mediaType, joueurs, streameuse);
    return ok(analyse);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('[analyse] clé refusée par le service de lecture');
      return fail('ERREUR_SERVEUR', 'La lecture des captures est indisponible.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail('TROP_DE_REQUETES', 'Le service de lecture est saturé, réessaie dans un instant.');
    }
    if (error instanceof Anthropic.APIError) {
      return fail('ERREUR_SERVEUR', `Lecture impossible (${error.status ?? 'API'}).`);
    }
    console.error('[analyse] échec', error);
    return fail('ERREUR_SERVEUR', 'La lecture de la capture a échoué.');
  }
}
