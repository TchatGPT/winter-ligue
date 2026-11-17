import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { BOOSTERS_DE_BIENVENUE } from '@/lib/domain/rules';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { classementDe } from '@/lib/services/league';
import {
  ajusteBoostersPerso,
  donneBoosterCadeau,
  fileDesPacks,
  joueursEnLice,
  reserveHorsLigue,
  SOURCE_HORS_LIGUE,
} from '@/lib/services/packs';

/**
 * « Ne joue pas » (17/11/2026) : un compte connecté par Twitch que la
 * modération coche parce qu'il ne joue pas. Il quitte le classement et les
 * tirages, et ses Boosters Perso deviennent des boosters cadeau.
 */
function inscrit(db: Database, id: string, nom: string) {
  return rattacheCompteTwitch(db, { id, login: nom.toLowerCase(), displayName: nom, avatarUrl: null, roleChaine: 'joueur' });
}

function ligue() {
  const db = emptyDatabase();
  const joueur = inscrit(db, 'tw-a', 'Alice');
  const absent = inscrit(db, 'tw-b', 'Bruno');
  return { db, joueur, absent };
}

describe('un compte qui ne joue pas', () => {
  it('n’est coché par personne à son arrivée', () => {
    const { absent } = ligue();
    expect(absent.horsLigue ?? false).toBe(false);
  });

  it('quitte le classement, les tirages et la file des boosters', () => {
    const { db, absent } = ligue();
    absent.horsLigue = true;
    expect(classementDe(db).map((r) => r.id)).not.toContain(absent.id);
    expect(joueursEnLice(db).map((p) => p.id)).not.toContain(absent.id);
    expect(fileDesPacks(db).some((d) => d.joueurId === absent.id)).toBe(false);
    expect(() => ajusteBoostersPerso(db, absent.id, 'plus', 'modo')).toThrow('ne joue pas');
  });

  it('a ses Boosters Perso en boosters cadeau, qui se donnent à un joueur', () => {
    const { db, joueur, absent } = ligue();
    absent.horsLigue = true;
    const source = SOURCE_HORS_LIGUE + absent.id;
    expect(reserveHorsLigue(db)).toEqual([
      expect.objectContaining({ twitchId: source, pseudo: 'Bruno', restants: BOOSTERS_DE_BIENVENUE, donnes: 0 }),
    ]);

    const r = donneBoosterCadeau(db, joueur.id, [], 'modo', { donateur: source, nombre: 2 });
    expect(r).toMatchObject({ nombre: 2, reserve: BOOSTERS_DE_BIENVENUE - 2, donateur: 'Bruno' });
    const recus = db.packsDus.filter((d) => d.joueurId === joueur.id && d.donDe === source);
    expect(recus).toHaveLength(2);
    expect(reserveHorsLigue(db)[0]).toMatchObject({ restants: BOOSTERS_DE_BIENVENUE - 2, donnes: 2 });

    // Plus qu'il n'en reste : refusé.
    expect(() => donneBoosterCadeau(db, joueur.id, [], 'modo', { donateur: source, nombre: 5 })).toThrow('Il ne reste que');
    // Et rien ne se donne à un compte qui ne joue pas.
    expect(() => donneBoosterCadeau(db, absent.id, [], 'modo', { donateur: source })).toThrow('ne joue pas');
  });

  it('décoché, revient dans la ligue avec ce qui n’a pas été donné', () => {
    const { db, joueur, absent } = ligue();
    absent.horsLigue = true;
    donneBoosterCadeau(db, joueur.id, [], 'modo', { donateur: SOURCE_HORS_LIGUE + absent.id, nombre: 1 });
    absent.horsLigue = false;
    expect(reserveHorsLigue(db)).toEqual([]);
    expect(fileDesPacks(db).filter((d) => d.joueurId === absent.id)).toHaveLength(BOOSTERS_DE_BIENVENUE - 1);
    expect(joueursEnLice(db).map((p) => p.id)).toContain(absent.id);
  });
});
