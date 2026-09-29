import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
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
  });
  if (!g.ok) return g.response;

  if (!isReconnaissanceEnabled()) {
    return fail(
      'INTROUVABLE',
      'La reconnaissance des captures n’est pas activée : ANTHROPIC_API_KEY manque côté serveur.',
    );
  }

  const joueurs = await getStore().read((db) =>
    db.players
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
        activisionId: p.activisionId,
        twitchLogin: p.twitchLogin,
      })),
  );

  try {
    const analyse = await analyseCapture(g.body.image, g.body.mediaType, joueurs);
    return ok(analyse);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return fail('ERREUR_SERVEUR', 'Clé d’API Anthropic refusée.');
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
