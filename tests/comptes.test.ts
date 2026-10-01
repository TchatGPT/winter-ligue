import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { rattacheCompteTwitch, suisModerationTwitch, type ProfilTwitch } from '@/lib/services/comptes';

/**
 * Le rôle suit la chaîne Twitch à chaque connexion : la streameuse et ses
 * modérateurs administrent, les autres jouent. Seul un rôle choisi à la main
 * dans l'administration n'est plus touché.
 */
function profil(id: string, login: string, roleChaine: ProfilTwitch['roleChaine']): ProfilTwitch {
  return { id, login, displayName: login, avatarUrl: null, roleChaine };
}

function connecte(db: Database, id: string, login: string, roleChaine: ProfilTwitch['roleChaine']) {
  return rattacheCompteTwitch(db, profil(id, login, roleChaine));
}

describe('le rôle donné par la chaîne', () => {
  it('crée le compte avec le rôle de la chaîne, sans le marquer comme choisi à la main', () => {
    const db = emptyDatabase();
    const modo = connecte(db, 't1', 'modo', 'admin');
    const viewer = connecte(db, 't2', 'viewer', 'joueur');
    expect(modo.role).toBe('admin');
    expect(viewer.role).toBe('joueur');
    expect(modo.roleManuel).toBe(false);
  });

  it('retire l’administration à un modérateur retiré sur Twitch, à sa connexion suivante', () => {
    const db = emptyDatabase();
    const modo = connecte(db, 't1', 'modo', 'admin');
    connecte(db, 't1', 'modo', 'joueur');
    expect(modo.role).toBe('joueur');
    expect(db.players).toHaveLength(1);
  });

  it('donne l’administration à un joueur devenu modérateur', () => {
    const db = emptyDatabase();
    const joueur = connecte(db, 't1', 'nouveau', 'joueur');
    connecte(db, 't1', 'nouveau', 'admin');
    expect(joueur.role).toBe('admin');
  });

  it('ne touche à aucun rôle quand la chaîne est inconnue', () => {
    const db = emptyDatabase();
    const modo = connecte(db, 't1', 'modo', 'admin');
    connecte(db, 't1', 'modo', null);
    expect(modo.role).toBe('admin');
  });
});

describe('le rôle choisi à la main', () => {
  it('garde admin quelqu’un qui ne modère pas la chaîne', () => {
    const db = emptyDatabase();
    const ami = connecte(db, 't1', 'ami', 'joueur');
    ami.role = 'admin';
    ami.roleManuel = true;
    connecte(db, 't1', 'ami', 'joueur');
    expect(ami.role).toBe('admin');
  });

  it('garde joueur un modérateur à qui l’on a retiré la main', () => {
    const db = emptyDatabase();
    const modo = connecte(db, 't1', 'modo', 'admin');
    modo.role = 'joueur';
    modo.roleManuel = true;
    connecte(db, 't1', 'modo', 'admin');
    expect(modo.role).toBe('joueur');
  });
});

describe('les modérateurs suivis en direct', () => {
  it('donne et retire l’administration quand Twitch l’annonce, sans reconnexion', () => {
    const db = emptyDatabase();
    const joueur = connecte(db, 't1', 'nouveau', 'joueur');
    suisModerationTwitch(db, { twitchId: 't1', role: 'admin', chaine: 'lriaa' });
    expect(joueur.role).toBe('admin');
    suisModerationTwitch(db, { twitchId: 't1', role: 'joueur', chaine: 'lriaa' });
    expect(joueur.role).toBe('joueur');
  });

  it('ne touche ni la streameuse, ni un rôle choisi à la main, ni personne d’inconnu', () => {
    const db = emptyDatabase();
    const streameuse = connecte(db, 't0', 'Lriaa', 'admin');
    const manuel = connecte(db, 't2', 'manuel', 'admin');
    manuel.roleManuel = true;
    expect(suisModerationTwitch(db, { twitchId: 't0', role: 'joueur', chaine: 'lriaa' })).toBeNull();
    expect(suisModerationTwitch(db, { twitchId: 't2', role: 'joueur', chaine: 'lriaa' })).toBeNull();
    expect(suisModerationTwitch(db, { twitchId: 'inconnu', role: 'admin', chaine: 'lriaa' })).toBeNull();
    expect(streameuse.role).toBe('admin');
    expect(manuel.role).toBe('admin');
    expect(db.players).toHaveLength(2);
  });
});
