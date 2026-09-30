import 'server-only';

import type { Database, Player, PlayerRole } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { ECONOMY } from '@/lib/domain/rules';
import { makeSlug } from '@/lib/services/league';
import { audit, credit } from '@/lib/services/ledger';

/** Ce que la connexion Twitch sait de la personne. */
export interface ProfilTwitch {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /** Le rôle sur la chaîne de la ligue, ou null s'il est inconnu. */
  roleChaine: PlayerRole | null;
}

/**
 * Retrouve ou crée le compte rattaché à ce profil Twitch.
 *
 * Le compte est rattaché par `twitchId`, pas par le pseudo : un joueur qui
 * renomme sa chaîne garde son classement, et personne ne récupère le compte
 * d'un autre en prenant son ancien pseudo.
 *
 * Le rôle suit la chaîne à chaque connexion : la streameuse et ses modérateurs
 * administrent, les autres jouent, et un modérateur retiré sur Twitch perd son
 * accès ici à sa connexion suivante. Seul un rôle choisi à la main dans
 * l'administration (`roleManuel`) n'est plus touché : c'est ainsi qu'on donne
 * la main à quelqu'un qui ne modère pas la chaîne, ou qu'on la retire à un
 * modérateur.
 *
 * Un compte désactivé le reste : se reconnecter ne le rouvre pas, c'est à la
 * route de refuser la session. Il a longtemps été réactivé ici, en silence —
 * une exclusion se défaisait d'un simple clic sur « Se connecter ».
 *
 * À appeler dans une transaction.
 */
export function rattacheCompteTwitch(db: Database, profil: ProfilTwitch): Player {
  const existant = db.players.find((p) => p.twitchId === profil.id);
  if (existant) {
    // On rafraîchit l'affichage sans toucher au slug déjà partagé en lien.
    existant.pseudo = profil.displayName;
    existant.twitchLogin = profil.login;
    existant.avatarUrl = profil.avatarUrl;
    if (profil.roleChaine && !existant.roleManuel && existant.role !== profil.roleChaine) {
      audit(db, 'twitch', 'ROLE_CHAINE', existant.id, `${existant.pseudo} : ${existant.role} → ${profil.roleChaine}`);
      existant.role = profil.roleChaine;
    }
    return existant;
  }

  const cree: Player = {
    id: newId(),
    slug: makeSlug(db, profil.displayName),
    pseudo: profil.displayName,
    twitchId: profil.id,
    twitchLogin: profil.login,
    avatarUrl: profil.avatarUrl,
    activisionId: null,
    snowflakes: 0,
    subsOfferts: 0,
    creneauxBonus: 0,
    immuniseJusqua: null,
    sessionsDepuis: null,
    joinedAt: new Date().toISOString(),
    active: true,
    role: profil.roleChaine ?? 'joueur',
    roleManuel: false,
  };
  db.players.push(cree);
  credit(db, cree.id, ECONOMY.welcomeGrant, 'INSCRIPTION', null);
  if (cree.role !== 'joueur') {
    audit(db, 'twitch', 'ROLE_CHAINE', cree.id, `${cree.pseudo} : ${cree.role}`);
  }
  return cree;
}
