import 'server-only';

/**
 * Traduction des erreurs métier en réponses HTTP.
 *
 * Les routes ne composent jamais un message d'erreur elles-mêmes : elles
 * laissent remonter une `CardError` / `MarketError` / `LedgerError` et la
 * passent ici. Cela garantit qu'une exception inattendue ne fuit jamais de
 * détail d'implémentation au client — elle devient une 500 générique, la trace
 * restant dans les logs serveur.
 */

import { NextResponse } from 'next/server';
import { CardError } from '@/lib/services/cards';
import { LedgerError } from '@/lib/services/ledger';
import { MarketError } from '@/lib/services/market';
import { fail } from './respond';

export function toResponse(error: unknown): NextResponse {
  if (error instanceof CardError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }
  if (error instanceof MarketError) {
    return fail('CONFLIT', error.message, { code: error.code, ...(error.detail ?? {}) });
  }
  if (error instanceof LedgerError) {
    return fail('CONFLIT', error.message, { code: error.code });
  }

  console.error('[winter-ligue] erreur non gérée', error);
  return fail('ERREUR_SERVEUR', 'Une erreur inattendue est survenue.');
}
