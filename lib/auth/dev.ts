import 'server-only';

import { baseDistante } from '@/lib/db/store';

/**
 * La connexion de développement : incarner un joueur, pour tester.
 *
 * Triple verrou : jamais en production, jamais sans `ALLOW_DEV_LOGIN=true`
 * posé sciemment, et jamais sur une base distante — un serveur local lancé
 * avec la vraie adresse aurait ouvert la ligue à quiconque joint ce poste.
 */
export function connexionDeDeveloppement(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true' && !baseDistante();
}
