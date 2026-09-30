import 'server-only';

import { SUJET_SECOURS } from '@/lib/auth/session';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore, sansBaseDurable } from '@/lib/db/store';
import { audit } from '@/lib/services/ledger';

/**
 * L'entrée par mot de passe : la porte de l'administration tant que Twitch
 * n'est pas branché, et son filet ensuite.
 *
 * Le mot de passe n'est jamais stocké, seule son empreinte scrypt vit dans
 * `ADMIN_PASSWORD_HASH` (`npm run hash-password`). Sans elle, la porte est
 * fermée.
 *
 * On entre sur le compte de l'administratrice — celui de la chaîne de la
 * ligue, sinon le premier administrateur actif —, pour pouvoir tout voir du
 * site comme elle. S'il n'y en a aucun, on ouvre la session de secours, sans
 * joueur derrière, qui ne sert qu'à administrer : c'est elle qui permet de
 * reprendre la main si plus personne n'a le rôle.
 *
 * Chaque entrée est inscrite au journal.
 */
export async function entreeParMotDePasse(): Promise<{ sujet: string; secours: boolean }> {
  if (sansBaseDurable()) return { sujet: SUJET_SECOURS, secours: true };

  const chaine = chaineDeLaLigue();
  return getStore().transaction((db) => {
    const actifs = db.players.filter((p) => p.active && p.role === 'admin');
    const admin = actifs.find((p) => p.twitchLogin === chaine || p.slug === chaine) ?? actifs[0] ?? null;
    audit(
      db,
      admin?.id ?? SUJET_SECOURS,
      'CONNEXION_MOT_DE_PASSE',
      admin?.id ?? null,
      admin ? `Entrée par mot de passe sur le compte ${admin.pseudo}` : 'Session de secours, sans compte',
    );
    return admin ? { sujet: admin.id, secours: false } : { sujet: SUJET_SECOURS, secours: true };
  });
}

/** La porte est-elle posée ? Sert à montrer le formulaire, rien de plus. */
export function motDePasseConfigure(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH?.trim());
}
