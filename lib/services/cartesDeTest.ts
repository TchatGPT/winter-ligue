import 'server-only';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import type { Database, OuverturePack, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { cartesDuPack, getCard, getPack, momentDe, PACKS, resumeEffet } from '@/lib/domain/catalog';
import { PREFIXE_OUVERTURE_TEST, TESTEURS_CARTES } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { RARITIES, type MomentCarte, type PackId, type Rarity } from '@/lib/domain/types';
import { nombreDeFictifs } from './donneesFictives';
import { carteQuiAttend, regleCartesSansAttendre } from './effects';
import { audit } from './ledger';
import { PackError } from './packs';

/**
 * La page de test de la modération (décidée le 02/11/2026) : un testeur
 * (`TESTEURS_CARTES`) se donne la carte de son choix, d'un booster de son
 * choix, pour voir ce qu'elle fait.
 *
 * C'est une exception à « aucun admin n'agit sur son propre compte » : elle
 * ne vaut que pour les comptes de la liste, lus en base — jamais pour un autre
 * modérateur —, et seulement sur son propre compte, jamais sur celui d'un
 * autre joueur. La carte est posée comme à une ouverture — une ouverture du
 * booster choisi, à son nom, déjà « révélée » pour que rien ne parte dans le
 * tchat, et marquée (`PREFIXE_OUVERTURE_TEST`) pour que l'overlay du live ne
 * la joue pas —, puis ce qui se règle tout de suite l'est. Elle compte pour de
 * vrai : score, flocons, Jokers. Le journal garde chaque carte donnée.
 */

/** Ce joueur peut-il se donner des cartes ? Son identifiant Twitch, lu en base, est dans la liste. */
export function estTesteur(db: Readonly<Database>, joueurId: string | null): boolean {
  if (!joueurId) return false;
  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  return joueur?.twitchId != null && TESTEURS_CARTES.includes(joueur.twitchId);
}

/** Une ouverture faite par la page de test, et non un vrai tirage. */
export function estOuvertureDeTest(o: { idempotencyKey: string }): boolean {
  return o.idempotencyKey.startsWith(PREFIXE_OUVERTURE_TEST);
}

/**
 * La carte qui attend sa prochaine game, si elle vient de la page de test.
 * Une vraie carte de la ligue — un malus tombé d'un booster — ne se retire pas.
 */
function carteDeTestQuiAttend(db: Database, joueurId: string) {
  const attend = carteQuiAttend(db, joueurId);
  if (!attend) return null;
  const ouverture = db.ouvertures.find((o) => o.id === attend.ouvertureId);
  return ouverture && estOuvertureDeTest(ouverture) ? attend : null;
}

function testeur(db: Database, joueurId: string): Player {
  if (!estTesteur(db, joueurId)) {
    throw new PackError('Cette page est réservée aux testeurs de la ligue.', 'JOUEUR_INTROUVABLE');
  }
  const joueur = db.players.find((p) => p.id === joueurId)!;
  if (estLaStreameuse(joueur, chaineDeLaLigue())) {
    throw new PackError('La streameuse ne joue pas dans la ligue : aucune carte ne tombe sur elle.', 'STREAMEUSE');
  }
  return joueur;
}

/**
 * Donne au testeur une carte d'un booster. À appeler dans une transaction.
 *
 * La carte doit sortir de ce booster. Pas de stock de cartes, même ici : une
 * carte qui attend une game ne se donne pas tant que la sienne n'a pas joué —
 * `retireCarteDeTest` la retire. Une carte gardée (Joker, Verglas, Pacte) ou
 * qui se règle tout de suite (flocons, points bonus) ne bloque rien. Une carte
 * à deux tombe sur lui seul : sans adversaire, elle ne fait rien. La même clé
 * rejoue la même réponse : un double clic ne donne qu'une carte.
 */
export function donneCarteDeTest(
  db: Database,
  joueurId: string,
  demande: { packId: PackId; cardId: string; cle: string },
  acteur: string,
): { carte: string; resultat: string | null } {
  const joueur = testeur(db, joueurId);
  const pack = getPack(demande.packId);
  if (!pack) throw new PackError('Booster inconnu.', 'PACK_INCONNU');
  const card = cartesDuPack(pack.id).find((c) => c.id === demande.cardId);
  if (!card) throw new PackError(`Cette carte ne sort pas du ${pack.name}.`, 'CARTE_INCONNUE');

  const cle = `${PREFIXE_OUVERTURE_TEST}${demande.cle}`;
  const deja = db.ouvertures.find((o) => o.idempotencyKey === cle);
  if (deja) {
    const posee = db.cartesEnAttente.find((c) => c.ouvertureId === deja.id);
    return { carte: getCard(deja.cardId)?.name ?? deja.cardId, resultat: posee?.resultat ?? null };
  }

  // Ce qui attendait encore sa révélation se règle d'abord, comme quand on
  // rouvre pour lui.
  const now = new Date();
  regleCartesSansAttendre(db, joueur.id, now, true);
  const moment = momentDe(card.effect);
  const attend = carteQuiAttend(db, joueur.id);
  if (attend && (moment === 'PROCHAINE' || moment === 'JOUEE')) {
    throw new PackError(
      `Tu as déjà une carte qui attend (${getCard(attend.cardId)?.name ?? 'une carte'}) : joue-la, ou retire-la, avant d’en prendre une autre qui attend une game.`,
      'CARTE_EN_ATTENTE',
    );
  }

  const quand = now.toISOString();
  const ouverture: OuverturePack = {
    id: newId(),
    packId: pack.id,
    cardId: card.id,
    rarity: card.rarity,
    joueurId: joueur.id,
    beneficiaires: [joueur.id],
    chance: 0,
    ouvertPar: acteur,
    openedAt: quand,
    idempotencyKey: cle,
    // Déjà « révélée » : rien n'attend l'écran, et rien ne part dans le tchat.
    annonceeA: quand,
  };
  db.ouvertures.push(ouverture);
  const posee = {
    id: newId(),
    joueurId: joueur.id,
    cardId: card.id,
    ouvertureId: ouverture.id,
    creeA: quand,
    consommeeA: null,
    gameId: null,
    resultat: null,
    paireId: null,
  };
  db.cartesEnAttente.push(posee);
  regleCartesSansAttendre(db, joueur.id, now, true);

  audit(db, acteur, 'CARTE_TEST', joueur.id, `Page de test : ${card.name} (${card.rarity}, ${pack.name}) pour ${joueur.pseudo}`);
  return { carte: card.name, resultat: posee.resultat };
}

/**
 * Retire au testeur la carte de test qui attend sa prochaine game : elle ne
 * jouera pas. Seulement une carte de la page de test : une carte tombée d'un
 * vrai booster joue, comme pour tout le monde.
 */
export function retireCarteDeTest(db: Database, joueurId: string, acteur: string): { carte: string } {
  const joueur = testeur(db, joueurId);
  if (!carteQuiAttend(db, joueur.id)) throw new PackError('Tu n’as aucune carte qui attend une game.', 'AUCUN_DU');
  const attend = carteDeTestQuiAttend(db, joueur.id);
  if (!attend) {
    throw new PackError(
      'La carte qui attend ta game vient d’un vrai booster : elle jouera, comme pour tout le monde.',
      'CARTE_EN_ATTENTE',
    );
  }
  const nom = getCard(attend.cardId)?.name ?? attend.cardId;
  attend.consommeeA = new Date().toISOString();
  attend.resultat = 'retirée depuis la page de test, sans effet';
  audit(db, acteur, 'CARTE_TEST_RETIREE', joueur.id, `Page de test : ${nom} retirée à ${joueur.pseudo}`);
  return { carte: nom };
}

/** Une carte, telle que la page de test la propose. */
export interface CarteDeTest {
  id: string;
  nom: string;
  action: string;
  description: string;
  resume: string;
  rarity: Rarity;
  glyph: string;
  nature: 'bonus' | 'malus';
  moment: MomentCarte;
}

export interface VueTestCartes {
  pseudo: string;
  boosters: { id: PackId; nom: string; cartes: CarteDeTest[] }[];
  /** La carte qui attend sa prochaine game, s'il en a une. */
  enAttente: string | null;
  /** Elle vient de la page de test : elle peut se retirer. */
  enAttenteRetirable: boolean;
  /** Les cartes qu'il garde, comptées par nom : « Joker Givré » × 3. */
  gardees: { nom: string; nombre: number }[];
  /** Les joueurs fictifs dans la ligue (`donneesFictives`) : zéro, ou les 24. */
  fictifs: number;
}

/** Ce que la page de test montre au testeur, ou null s'il n'en est pas un. */
export function vueTestCartes(db: Readonly<Database>, joueurId: string | null): VueTestCartes | null {
  if (!joueurId || !estTesteur(db, joueurId)) return null;
  const joueur = db.players.find((p) => p.id === joueurId)!;
  const ordre = (r: Rarity) => RARITIES.indexOf(r);
  const boosters = PACKS.map((pack) => ({
    id: pack.id,
    nom: pack.name,
    cartes: cartesDuPack(pack.id)
      .slice()
      .sort((a, b) => ordre(a.rarity) - ordre(b.rarity) || a.power - b.power)
      .map((c) => ({
        id: c.id,
        nom: c.name,
        action: c.subtitle,
        description: c.description,
        resume: resumeEffet(c.effect),
        rarity: c.rarity,
        glyph: c.glyph,
        nature: c.nature,
        moment: momentDe(c.effect),
      })),
  }));
  const attend = carteQuiAttend(db as Database, joueurId);
  const gardees = new Map<string, number>();
  for (const c of db.cartesEnAttente) {
    if (c.joueurId !== joueurId || c.consommeeA !== null) continue;
    const card = getCard(c.cardId);
    if (!card || momentDe(card.effect) !== 'GARDEE') continue;
    gardees.set(card.name, (gardees.get(card.name) ?? 0) + 1);
  }
  return {
    pseudo: joueur.pseudo,
    boosters,
    enAttente: attend ? (getCard(attend.cardId)?.name ?? attend.cardId) : null,
    enAttenteRetirable: carteDeTestQuiAttend(db as Database, joueurId) !== null,
    gardees: [...gardees].map(([nom, nombre]) => ({ nom, nombre })),
    fictifs: nombreDeFictifs(db),
  };
}
