import 'server-only';

import { SUJET_SECOURS, type Role } from '@/lib/auth/session';
import type { Player } from '@/lib/db/entities';
import { getStore, sansBaseDurable } from '@/lib/db/store';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

/**
 * La connexion Twitch simulée : ce que Twitch répondrait, en attendant le vrai
 * branchement.
 *
 * Le circuit est déjà le vrai — le bouton, `/api/auth/twitch`, puis l'adresse
 * de retour `/api/auth/twitch/callback`. Seul le passage chez Twitch est joué :
 * tant que `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` manquent, la route de
 * départ renvoie aussitôt sur l'adresse de retour avec un code de simulation,
 * et c'est ici qu'on décide sur quel compte entrer.
 *
 * On entre sur le compte de la streameuse — celui dont le pseudo est
 * `TWITCH_BROADCASTER_LOGIN`, sinon le premier administrateur actif — ou, si
 * la base n'en a aucun, sur un compte « Streameuse » créé pour l'occasion.
 * N'importe qui entre donc en administrateur : c'est documenté dans
 * `docs/SECURITE.md`, et cela cesse de soi-même dès que Twitch est branché.
 */
export async function compteSimule(): Promise<{ sujet: string; role: Role; bienvenue: boolean }> {
  /*
   * Sur Vercel sans base, chaque serveur a sa propre copie éphémère des
   * données : un compte créé sur l'un n'existe pas sur l'autre, et la page
   * suivante renverrait à la connexion, en boucle. On ouvre alors une session
   * d'administration sans compte joueur derrière.
   */
  if (sansBaseDurable()) return { sujet: SUJET_SECOURS, role: 'admin', bienvenue: false };

  const chaine = process.env.TWITCH_BROADCASTER_LOGIN?.trim().toLowerCase() || null;
  const admin = await getStore().transaction((db): Player => {
    const actifs = db.players.filter((p) => p.active && p.role === 'admin');
    const trouve = (chaine && actifs.find((p) => p.twitchLogin === chaine || p.slug === chaine)) || actifs[0];
    if (trouve) return trouve;

    const cree = rattacheCompteTwitch(db, {
      id: 'demo:streameuse',
      login: 'streameuse',
      displayName: 'Streameuse',
      avatarUrl: null,
      roleChaine: 'admin',
    });
    // Pour entrer sans détour : la bienvenue ne demandera rien à ce compte.
    cree.activisionId ??= cree.pseudo;
    return cree;
  });

  return { sujet: admin.id, role: 'admin', bienvenue: !admin.activisionId };
}
