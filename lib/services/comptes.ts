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
 * administrent, les autres jouent. Entre deux connexions, Twitch prévient le
 * site des modérateurs ajoutés ou retirés (`suisModerationTwitch`). Un rôle marqué `roleManuel` n'est pas
 * touché ; plus aucun écran ne le pose.
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
  // Rien à l'inscription aujourd'hui : on n'écrit pas une ligne à zéro.
  if (ECONOMY.welcomeGrant > 0) credit(db, cree.id, ECONOMY.welcomeGrant, 'INSCRIPTION', null);
  if (cree.role !== 'joueur') {
    audit(db, 'twitch', 'ROLE_CHAINE', cree.id, `${cree.pseudo} : ${cree.role}`);
  }
  return cree;
}

/**
 * Twitch annonce qu'une personne devient modératrice de la chaîne, ou cesse de
 * l'être : son compte, s'il existe, prend le rôle qui va avec. Il vaut dès la
 * requête suivante, sans attendre qu'elle se reconnecte.
 *
 * La streameuse n'est jamais touchée — sa chaîne la fait admin —, ni un rôle
 * marqué `roleManuel`. Quelqu'un qui n'a pas encore de compte recevra son rôle
 * à sa première connexion. Rejouer le même message ne change rien.
 *
 * À appeler dans une transaction. Retourne le joueur modifié, ou null.
 */
export function suisModerationTwitch(
  db: Database,
  changement: { twitchId: string; role: PlayerRole; chaine: string },
): Player | null {
  const joueur = db.players.find((p) => p.twitchId === changement.twitchId);
  if (!joueur || joueur.roleManuel || joueur.role === changement.role) return null;
  if (joueur.twitchLogin?.toLowerCase() === changement.chaine) return null;
  audit(db, 'twitch', 'ROLE_CHAINE', joueur.id, `${joueur.pseudo} : ${joueur.role} → ${changement.role}`);
  joueur.role = changement.role;
  return joueur;
}
