import { describe, expect, it } from 'vitest';
import type { Database, Game, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { CARDS, getCard, momentDe, resumeEffet } from '@/lib/domain/catalog';
import { CRENEAUX_BONUS, SEASON, tailleDeLaQueue } from '@/lib/domain/rules';
import { scoreGame } from '@/lib/domain/scoring';
import type { Placement } from '@/lib/domain/types';
import { appliqueCartesEnAttente, gamesSansCarte, regleCartesSansAttendre } from '@/lib/services/effects';
import { limiteDe } from '@/lib/services/league';
import {
  joueursEnLice,
  ouvrePack,
  PackError,
  peutRecevoir,
  queueDuClassement,
  reglagePack,
  teteDuClassement,
} from '@/lib/services/packs';

/**
 * Ce que font les cartes, action par action.
 *
 * `equilibre.test.ts` garde le jeu jouable ; ce fichier vérifie que chaque
 * action fait ce que sa carte annonce, et que les trois moments — la
 * prochaine game, une game déjà jouée, tout de suite — tiennent leurs règles.
 */

const MAINTENANT = new Date('2027-01-15T20:30:00.000Z');
const heures = (n: number) => new Date(MAINTENANT.getTime() + n * 3_600_000);

function joueur(id: string, plus: Partial<Player> = {}): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes: 0,
    subsOfferts: 0,
    creneauxBonus: 0,
    immuniseJusqua: null,
    sessionsDepuis: null,
    joinedAt: '2027-01-01T00:00:00.000Z',
    active: true,
    role: 'joueur',
    ...plus,
  };
}

function base(...ids: string[]): Database {
  const db = emptyDatabase();
  for (const id of ids) db.players.push(joueur(id));
  return db;
}

let compteur = 0;

function game(db: Database, playerId: string, kills: number, placement: Placement = null): Game {
  compteur += 1;
  const g: Game = {
    id: `g${compteur}`,
    playerId,
    kills,
    placement,
    bonusPoints: 0,
    skipped: false,
    score: scoreGame({ kills, placement, bonusPoints: 0 }).total,
    note: null,
    // Chaque game est plus récente que la précédente.
    playedAt: new Date(Date.UTC(2027, 0, 15, 18, 0, compteur)).toISOString(),
    createdAt: '2027-01-15T18:00:00.000Z',
    applied: [],
  };
  db.games.push(g);
  return g;
}

function pose(db: Database, joueurId: string, cardId: string, paireId: string | null = null) {
  compteur += 1;
  if (!getCard(cardId)) throw new Error(`carte inconnue : ${cardId}`);
  db.cartesEnAttente.push({
    id: `c${compteur}`,
    joueurId,
    cardId,
    ouvertureId: `o${compteur}`,
    creeA: new Date(Date.UTC(2027, 0, 15, 17, 0, compteur)).toISOString(),
    consommeeA: null,
    gameId: null,
    resultat: null,
    paireId,
  });
  return db.cartesEnAttente[db.cartesEnAttente.length - 1];
}

/** Pose une carte, joue une game, et rend la game. */
function joue(
  cardId: string,
  kills: number,
  placement: Placement = null,
  meilleurKills: number | null = null,
): { game: Game; db: Database; resultat: string | null } {
  const db = base('a');
  const carte = pose(db, 'a', cardId);
  const g = game(db, 'a', kills, placement);
  appliqueCartesEnAttente(db, g, { meilleurKills }, MAINTENANT);
  return { game: g, db, resultat: carte.resultat };
}

const enAttente = (db: Database, joueurId: string) =>
  db.cartesEnAttente.filter((c) => c.joueurId === joueurId && c.consommeeA === null);

describe('sur la prochaine game', () => {
  it('« Multiplicateur game » multiplie le score entier, kills et top', () => {
    // 10 kills et un Top 1 : 30 points. ×1,2 → +6.
    expect(joue('vent-du-nord', 10, 1).game.score).toBe(30 + 6);
    // ×1,3 → +9 ; ×1,5 → +15 ; ×2 → plafonné à +25.
    expect(joue('blizzard', 10, 1).game.bonusPoints).toBe(9);
    expect(joue('nuit-polaire', 10, 1).game.bonusPoints).toBe(15);
    expect(joue('grand-nord', 10, 1).game.bonusPoints).toBe(25);
  });

  it('« Multiplicateur game » s’arrête à son plafond', () => {
    // 60 kills et un Top 1 : ×1,2 donnerait +16, la carte s'arrête à +10.
    expect(joue('vent-du-nord', 60, 1).game.bonusPoints).toBe(10);
  });

  it('« Une game ÷ 2 » retire la moitié, jusqu’à son plafond', () => {
    expect(joue('verglas', 10, null).game.score).toBe(5);
    expect(joue('verglas', 40, 1).game.bonusPoints).toBe(-15);
    // Une game à zéro ne descend pas sous zéro.
    expect(joue('verglas', 0, null).game.score).toBe(0);
  });

  it('« Clone kill du meilleur » prend les kills du meilleur tueur de la partie', () => {
    expect(joue('echo', 4, null, 9).game.score).toBe(9);
    // Plafonné : le meilleur a 30 kills, la carte en donne 10.
    expect(joue('echo', 4, null, 30).game.score).toBe(14);
    expect(joue('reflet', 4, null, 30).game.score).toBe(24);
  });

  it('« Clone kill du meilleur » ne fait rien pour le meilleur tueur, ni sans la donnée', () => {
    expect(joue('echo', 12, null, 12).game.bonusPoints).toBe(0);
    expect(joue('echo', 12, null, 7).game.bonusPoints).toBe(0);
    const sans = joue('echo', 4, null, null);
    expect(sans.game.bonusPoints).toBe(0);
    expect(sans.resultat).toContain('sans effet');
    // La carte est consommée quand même : elle ne reste pas en travers.
    expect(enAttente(sans.db, 'a')).toHaveLength(0);
  });

  it('« Joker » rattrape une game ratée, et ne touche pas une bonne game', () => {
    expect(joue('filet', 1).game.score).toBe(6);
    expect(joue('socle', 3).game.score).toBe(15);
    expect(joue('sanctuaire', 0).game.score).toBe(25);
    expect(joue('sanctuaire', 12, 1).game.bonusPoints).toBe(0);
  });

  it('« à partir du Top 3 » ne paie que sur un Top', () => {
    expect(joue('rafale', 5, 3).game.bonusPoints).toBe(4);
    expect(joue('rafale', 5, 1).game.bonusPoints).toBe(4);
    expect(joue('rafale', 5, null).game.bonusPoints).toBe(0);
    expect(joue('sang-froid', 5, 2).game.bonusPoints).toBe(12);
  });

  it('« petites games » ne paie que sous cinq kills', () => {
    expect(joue('boule-de-neige', 4).game.bonusPoints).toBe(4);
    expect(joue('boule-de-neige', 0).game.bonusPoints).toBe(4);
    expect(joue('boule-de-neige', 5).game.bonusPoints).toBe(0);
  });

  it('la Manne double les flocons de la game, sans toucher au score', () => {
    const db = base('a');
    pose(db, 'a', 'manne');
    const g = game(db, 'a', 7);
    const r = appliqueCartesEnAttente(db, g, {}, MAINTENANT);
    expect(r.facteurFlocons).toBe(2);
    expect(g.score).toBe(7);
  });
});

describe('l’immunité', () => {
  it('se prend tout de suite, pour le nombre d’heures annoncé', () => {
    const db = base('a');
    pose(db, 'a', 'bouclier-givre');
    const faites = regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(faites).toHaveLength(1);
    expect(db.players[0].immuniseJusqua).toBe(heures(48).toISOString());
    expect(enAttente(db, 'a')).toHaveLength(0);
  });

  it('se prolonge au lieu de repartir de zéro', () => {
    const db = base('a');
    pose(db, 'a', 'bouclier-givre');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    pose(db, 'a', 'bouclier-givre');
    regleCartesSansAttendre(db, 'a', heures(10));
    expect(db.players[0].immuniseJusqua).toBe(heures(96).toISOString());
  });

  it('pare un malus, qui disparaît', () => {
    const db = base('a');
    db.players[0].immuniseJusqua = heures(5).toISOString();
    pose(db, 'a', 'grand-froid');
    const g = game(db, 'a', 20);
    const r = appliqueCartesEnAttente(db, g, {}, MAINTENANT);
    expect(g.score).toBe(20);
    expect(r.cartes[0].resultat).toContain('immunité');
    expect(enAttente(db, 'a')).toHaveLength(0);
  });

  it('ne pare plus rien une fois finie', () => {
    const db = base('a');
    db.players[0].immuniseJusqua = heures(-1).toISOString();
    pose(db, 'a', 'givre-mordant');
    const g = game(db, 'a', 20);
    appliqueCartesEnAttente(db, g, {}, MAINTENANT);
    expect(g.score).toBe(16);
  });

  it('laisse passer les bonus', () => {
    const db = base('a');
    db.players[0].immuniseJusqua = heures(5).toISOString();
    pose(db, 'a', 'percee');
    const g = game(db, 'a', 20);
    appliqueCartesEnAttente(db, g, {}, MAINTENANT);
    expect(g.score).toBe(28);
  });

  it('annule l’échange entier quand celui qui y perdrait est immunisé', () => {
    // Le laisser gagner à l'autre créerait des points : personne ne bouge.
    const db = base('a', 'b');
    db.players[1].immuniseJusqua = heures(5).toISOString();
    pose(db, 'a', 'chasse-croise', 'paire');
    pose(db, 'b', 'chasse-croise', 'paire');
    const ga = game(db, 'a', 2);
    appliqueCartesEnAttente(db, ga, {}, MAINTENANT);
    const gb = game(db, 'b', 12);
    appliqueCartesEnAttente(db, gb, {}, MAINTENANT);
    expect(ga.score).toBe(2);
    expect(gb.score).toBe(12);
  });

  it('laisse l’échange se faire quand l’immunisé y gagne', () => {
    const db = base('a', 'b');
    db.players[0].immuniseJusqua = heures(5).toISOString();
    pose(db, 'a', 'chasse-croise', 'paire');
    pose(db, 'b', 'chasse-croise', 'paire');
    const ga = game(db, 'a', 2);
    appliqueCartesEnAttente(db, ga, {}, MAINTENANT);
    const gb = game(db, 'b', 7);
    appliqueCartesEnAttente(db, gb, {}, MAINTENANT);
    expect(ga.score).toBe(7);
    expect(gb.score).toBe(2);
  });
});

describe('la game supplémentaire', () => {
  it('ajoute un créneau à la limite de ce joueur, et de lui seul', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'refuge');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(limiteDe(db, db.players[0])).toBe(db.config.maxGamesPerPlayer + 1);
    expect(limiteDe(db, db.players[1])).toBe(db.config.maxGamesPerPlayer);
  });

  it('s’arrête à trois créneaux, et verse des flocons à la place', () => {
    // Sans borne, celui pour qui l'on ouvre le plus de boosters jouerait le
    // plus de games.
    const db = base('a');
    for (let i = 0; i < CRENEAUX_BONUS.max + 2; i += 1) {
      pose(db, 'a', 'refuge');
      regleCartesSansAttendre(db, 'a', MAINTENANT);
    }
    expect(db.players[0].creneauxBonus).toBe(CRENEAUX_BONUS.max);
    expect(db.players[0].snowflakes).toBe(CRENEAUX_BONUS.floconsDeRepli * 2);
    expect(db.ledger).toHaveLength(2);
  });
});

describe('les flocons', () => {
  it('sont crédités tout de suite, par le grand livre', () => {
    const db = base('a');
    pose(db, 'a', 'pluie-de-flocons');
    const faites = regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(faites[0].resultat).toContain('500');
    expect(db.players[0].snowflakes).toBe(500);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0].reason).toBe('CARTE');
  });
});

describe('sur une game déjà jouée', () => {
  it('« Pire game ramenée à la moyenne » relève la pire, jusqu’à son plafond', () => {
    const db = base('a');
    const pire = game(db, 'a', 4);
    game(db, 'a', 20);
    game(db, 'a', 30);
    // Moyenne de 18 : la pire monte de 4 à 18.
    pose(db, 'a', 'degel');
    const faites = regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(pire.score).toBe(18);
    expect(faites[0].gameId).toBe(pire.id);

    // Plafonnée : de 0 vers une moyenne de 30, elle s'arrête à +15.
    const autre = base('b');
    const zero = game(autre, 'b', 0);
    game(autre, 'b', 40, 1);
    pose(autre, 'b', 'degel');
    regleCartesSansAttendre(autre, 'b', MAINTENANT);
    expect(zero.score).toBe(15);
  });

  it('« Pire game ×2 » double la pire game qui a marqué', () => {
    const db = base('a');
    game(db, 'a', 0);
    const pire = game(db, 'a', 6);
    game(db, 'a', 25);
    pose(db, 'a', 'redoux');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(pire.score).toBe(12);
  });

  it('« Meilleure game ×1,5 » relève la meilleure, jusqu’à son plafond', () => {
    const db = base('a');
    game(db, 'a', 6);
    const meilleure = game(db, 'a', 20, 1);
    pose(db, 'a', 'gel-eternel');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    // 40 points ×1,5 : +20.
    expect(meilleure.score).toBe(60);

    const haut = base('b');
    game(haut, 'b', 6);
    const enorme = game(haut, 'b', 50, 1);
    pose(haut, 'b', 'gel-eternel');
    regleCartesSansAttendre(haut, 'b', MAINTENANT);
    expect(enorme.bonusPoints).toBe(25);
  });

  it('attend qu’il y ait deux games, puis tombe sans attendre la suivante', () => {
    const db = base('a');
    pose(db, 'a', 'redoux');
    expect(regleCartesSansAttendre(db, 'a', MAINTENANT)).toEqual([]);
    game(db, 'a', 5);
    expect(regleCartesSansAttendre(db, 'a', MAINTENANT)).toEqual([]);
    expect(enAttente(db, 'a')).toHaveLength(1);

    const seconde = game(db, 'a', 3);
    const faites = regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(faites).toHaveLength(1);
    expect(seconde.score).toBe(6);
    expect(enAttente(db, 'a')).toHaveLength(0);
  });

  it('ne passe pas devant la carte active : la prochaine game reste à celle-ci', () => {
    const db = base('a');
    pose(db, 'a', 'redoux');
    pose(db, 'a', 'percee');
    const g = game(db, 'a', 5);
    const r = appliqueCartesEnAttente(db, g, {}, MAINTENANT);
    expect(r.cartes.map((c) => c.cardId)).toEqual(['percee']);
    expect(g.score).toBe(13);
  });
});

describe('quand toutes les games sont jouées', () => {
  /** Un joueur qui a joué toute sa saison : deux games suffisent, limite à deux. */
  function finisseur(): { db: Database; basse: Game; haute: Game } {
    const db = base('a');
    db.config.maxGamesPerPlayer = 2;
    const basse = game(db, 'a', 3);
    const haute = game(db, 'a', 10, 1);
    return { db, basse, haute };
  }

  it('une carte de prochaine game tombe sur une game déjà jouée', () => {
    // Le Booster Finisseur s'ouvre quand il n'y a plus de prochaine game :
    // sans cette règle, sa carte attendrait pour toujours.
    const { db, haute, basse } = finisseur();
    pose(db, 'a', 'percee');
    const faites = regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(faites).toHaveLength(1);
    expect(haute.score + basse.score).toBe(3 + 30 + 8);
    expect(enAttente(db, 'a')).toHaveLength(0);
  });

  it('un bonus choisit la game où il rapporte le plus', () => {
    const { db, haute, basse } = finisseur();
    // Le multiplicateur rapporte plus sur la grosse game…
    pose(db, 'a', 'vent-du-nord');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(haute.bonusPoints).toBe(6);
    // …et le joker sur la petite, la seule qui reste sans carte.
    pose(db, 'a', 'socle');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(basse.score).toBe(15);
  });

  it('s’arrête quand il n’y a plus de game sans carte', () => {
    const { db } = finisseur();
    for (const id of ['congere', 'poudreuse', 'percee']) pose(db, 'a', id);
    const faites = regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(faites).toHaveLength(2);
    expect(enAttente(db, 'a')).toHaveLength(1);
    expect(gamesSansCarte(db, 'a')).toHaveLength(0);
  });

  it('une Manne verse ce qui manque pour doubler les flocons de la game', () => {
    const { db } = finisseur();
    pose(db, 'a', 'manne');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    expect(db.players[0].snowflakes).toBeGreaterThan(0);
    expect(db.ledger[0].reason).toBe('CARTE');
  });

  it('ne touche à rien tant qu’il reste une game à jouer', () => {
    const db = base('a');
    const g = game(db, 'a', 5);
    pose(db, 'a', 'percee');
    expect(regleCartesSansAttendre(db, 'a', MAINTENANT)).toEqual([]);
    expect(g.score).toBe(5);
  });

  it('un créneau gagné rouvre une prochaine game', () => {
    const { db, haute, basse } = finisseur();
    pose(db, 'a', 'refuge');
    pose(db, 'a', 'percee');
    regleCartesSansAttendre(db, 'a', MAINTENANT);
    // Le créneau est pris d'abord : il reste une game à jouer, la Percée attend.
    expect(haute.bonusPoints + basse.bonusPoints).toBe(0);
    expect(enAttente(db, 'a').map((c) => c.cardId)).toEqual(['percee']);
  });
});

describe('sur qui une carte tombe', () => {
  function ligue(): Database {
    const db = base('alpha', 'bravo', 'charlie', 'delta', 'echo', 'fox');
    db.players.push(joueur(SEASON.chaine, { role: 'admin' }));
    // Un classement net : alpha en tête, fox en queue.
    ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'fox'].forEach((id, i) => game(db, id, 30 - i * 5));
    return db;
  }

  it('jamais sur la streameuse : elle ne joue pas', () => {
    const db = ligue();
    expect(joueursEnLice(db).map((p) => p.id)).not.toContain(SEASON.chaine);
    expect(joueursEnLice(db)).toHaveLength(6);
  });

  it('refuse d’ouvrir un booster pour la streameuse', () => {
    const db = ligue();
    expect(() =>
      ouvrePack(db, { packId: 'perso', joueurId: SEASON.chaine, idempotencyKey: 'k1' }, 'test'),
    ).toThrow(PackError);
    expect(db.ouvertures).toHaveLength(0);
  });

  it('la tête et la queue sont celles du classement', () => {
    const db = ligue();
    expect(teteDuClassement(db)?.id).toBe('alpha');
    // Six joueurs : le dernier tiers, deux joueurs.
    expect(queueDuClassement(db).map((p) => p.id)).toEqual(['echo', 'fox']);
  });

  it('la queue compte un joueur au moins, trois au plus', () => {
    expect(tailleDeLaQueue(0)).toBe(0);
    expect(tailleDeLaQueue(1)).toBe(1);
    expect(tailleDeLaQueue(3)).toBe(1);
    expect(tailleDeLaQueue(6)).toBe(2);
    expect(tailleDeLaQueue(9)).toBe(3);
    expect(tailleDeLaQueue(40)).toBe(3);
  });

  it('un booster ouvert pose ou règle sa carte sur chaque bénéficiaire', () => {
    // Le tirage est au sort : on ouvre beaucoup, et l'on vérifie ce qui doit
    // rester vrai quelle que soit la carte.
    const db = ligue();
    for (let i = 0; i < 200; i += 1) {
      const pack = (['perso', 'commu', 'folie', 'finisseur'] as const)[i % 4];
      const pourUnJoueur = pack === 'perso' || pack === 'finisseur';
      const o = ouvrePack(
        db,
        { packId: pack, ...(pourUnJoueur ? { joueurId: 'charlie' } : {}), idempotencyKey: `cle-${i}` },
        'test',
      );
      const card = getCard(o.cardId)!;
      expect(card.packs).toContain(pack);
      expect(o.beneficiaires).not.toContain(SEASON.chaine);
      expect(o.beneficiaires.length).toBeGreaterThan(0);

      const posees = db.cartesEnAttente.filter((c) => c.ouvertureId === o.id);
      expect(posees).toHaveLength(o.beneficiaires.length);
      // Ce qui se règle tout de suite est réglé ; un malus n'est jamais réglé
      // à l'ouverture, il attend la prochaine game.
      for (const c of posees) {
        if (momentDe(card.effect) === 'INSTANT') expect(c.consommeeA).not.toBeNull();
        if (card.nature === 'malus') expect(c.consommeeA).toBeNull();
      }
      if (card.cible === 'DEUX' && !pourUnJoueur) {
        expect(new Set(posees.map((c) => c.paireId)).size).toBe(1);
        expect(posees[0].paireId).not.toBeNull();
      }
    }
    // Aucune game ne porte deux cartes.
    for (const g of db.games) expect(g.applied.length).toBeLessThanOrEqual(1);
  });

  it('ne tire pas un joueur qui ne peut plus rien recevoir', () => {
    // Alpha mène, a joué toute sa saison, et sa seule game porte déjà une
    // carte : une carte tirée sur lui serait perdue, et en finissant le
    // premier il deviendrait intouchable.
    const db = ligue();
    db.config.maxGamesPerPlayer = 1;
    // Les autres ont encore des games à jouer : un créneau de plus chacun.
    for (const p of db.players) if (p.id !== 'alpha') p.creneauxBonus = 2;
    const alpha = db.players.find((p) => p.id === 'alpha')!;
    pose(db, 'alpha', 'congere');
    regleCartesSansAttendre(db, 'alpha', MAINTENANT);
    expect(peutRecevoir(db, alpha)).toBe(false);
    expect(peutRecevoir(db, db.players.find((p) => p.id === 'bravo')!)).toBe(true);

    // Le Booster Folie réglé sur les légendaires : le malus de tête en sort.
    reglagePack(db, 'folie', { C: 0, PC: 0, R: 0, SR: 0, UR: 0, L: 100_000 });
    for (let i = 0; i < 60; i += 1) {
      const o = ouvrePack(db, { packId: 'folie', idempotencyKey: `tete-${i}` }, 'test');
      const card = getCard(o.cardId)!;
      if (card.cible === 'TOUS') continue;
      expect(o.beneficiaires).not.toContain('alpha');
      // La tête, c'est le premier de ceux qui peuvent encore recevoir.
      if (card.cible === 'TETE') expect(o.beneficiaires).toEqual(['bravo']);
    }
  });

  it('rend la même ouverture quand la même clé revient', () => {
    const db = ligue();
    const a = ouvrePack(db, { packId: 'commu', idempotencyKey: 'meme' }, 'test');
    const b = ouvrePack(db, { packId: 'commu', idempotencyKey: 'meme' }, 'test');
    expect(b.id).toBe(a.id);
    expect(db.ouvertures).toHaveLength(1);
  });
});

describe('ce que la carte dit d’elle', () => {
  it('a un résumé court pour chaque carte', () => {
    for (const card of CARDS) {
      const resume = resumeEffet(card.effect);
      expect(resume.length).toBeGreaterThan(3);
      expect(resume.length).toBeLessThanOrEqual(40);
    }
  });

  it('annonce les nombres qu’elle applique', () => {
    // La description est ce que le joueur lit : elle doit porter la valeur
    // que le serveur utilise, pas une valeur recopiée à la main et oubliée.
    for (const card of CARDS) {
      const e = card.effect;
      const fr = (n: number) => n.toLocaleString('fr-FR');
      if ('value' in e && e.kind !== 'snowflakes') expect(card.description).toContain(fr(e.value));
      if (e.kind === 'snowflakes') {
        expect(card.description.replace(/\s/g, '')).toContain(String(e.value));
      }
      if (e.kind === 'immunite') expect(card.description).toContain(String(e.heures));
      if (e.kind === 'petite_game') expect(card.description).toContain(`moins de ${e.moinsDe} kills`);
      if (e.kind === 'bonus_top') expect(card.description).toContain(`Top ${e.top}`);
    }
  });
});
