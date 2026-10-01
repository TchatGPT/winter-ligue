import 'server-only';

/**
 * Traduction des erreurs métier en réponses HTTP.
 *
 * Les routes ne composent jamais un message d'erreur elles-mêmes : elles
 * laissent remonter une `PackError` / `BatailleError` / `LedgerError` et la
 * passent ici. Cela garantit qu'une exception inattendue ne fuit jamais de
 * détail d'implémentation au client — elle devient une 500 générique, la trace
 * restant dans les logs serveur.
 */

import { NextResponse } from 'next/server';
import { BatailleError } from '@/lib/services/batailles';
import { CadeauError } from '@/lib/services/cadeauDuJour';
import { CodeError } from '@/lib/services/codes';
import { LedgerError } from '@/lib/services/ledger';
import { PackError } from '@/lib/services/packs';
import { SubError } from '@/lib/services/subs';
import { fail } from './respond';

export function toResponse(error: unknown): NextResponse {
  // Un refus de règle — pack déjà ouvert, joueur manquant, mise hors bornes —
  // est une réponse normale du jeu, pas une panne. Sans ces branches il
  // remonterait en 500 générique et l'écran ne saurait pas pourquoi.
  if (error instanceof PackError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }
  if (error instanceof BatailleError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }
  if (error instanceof LedgerError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }
  if (error instanceof SubError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }
  if (error instanceof CodeError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }
  if (error instanceof CadeauError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }

  console.error('[winter-ligue] erreur non gérée', error);
  return fail('ERREUR_SERVEUR', 'Une erreur inattendue est survenue.');
}
