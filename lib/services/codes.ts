import 'server-only';

/**
 * Les codes cadeaux : la modération met des flocons en jeu, les joueurs les
 * récupèrent en tapant le code — l'icône cadeau, près de leur solde.
 *
 * Tout ce qui compte se décide ici : le montant est celui du code, jamais celui
 * de la requête ; un joueur n'utilise un code qu'une fois ; un code ne sert pas
 * plus que prévu ; celui qui l'a créé ne s'en sert pas, et la streameuse, qui
 * ne joue pas, non plus.
 *
 * Chaque utilisation est un crédit au grand livre, avec le code en référence :
 * c'est le grand livre qui compte les utilisations et qui sait qui a déjà pris
 * le code. Le code, lui, ne garde que ses réglages — et qui l'a créé, que
 * chaque ligne du journal le concernant nomme.
 *
 * À appeler dans une transaction : deux joueurs qui visent la dernière
 * utilisation passent l'un après l'autre, et le second trouve le code épuisé.
 */

import type { CodeCadeau, Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import {
  ALPHABET_CODES,
  etatDuCode,
  LONGUEUR_CODE_TIRE,
  normaliseCode,
  UTILISATIONS_MAX,
  type EtatCode,
} from '@/lib/domain/codes';
import { ACTEURS_SYSTEME } from '@/lib/domain/acteurs';
import { secureInt } from '@/lib/domain/rng';
import { ECONOMY } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { audit, credit } from './ledger';

export class CodeError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'CODE_INVALIDE'
      | 'CODE_INCONNU'
      | 'CODE_EPUISE'
      | 'DEJA_UTILISE'
      | 'SON_CODE'
      | 'STREAMEUSE'
      | 'JOUEUR_INTROUVABLE',
  ) {
    super(message);
    this.name = 'CodeError';
  }
}

/** Les crédits versés par ce code : autant d'utilisations. */
function utilisations(db: Database, codeId: string) {
  return db.ledger.filter((l) => l.reason === 'CODE_CADEAU' && l.refId === codeId);
}

/**
 * Qui a créé le code, en clair : son pseudo. Il est nommé dans chaque ligne du
 * journal qui touche le code — sa création, chaque utilisation, sa
 * désactivation, sa suppression —, et il y reste quand le code a disparu.
 */
export function createurDuCode(db: Readonly<Database>, code: Pick<CodeCadeau, 'creePar'>): string {
  return db.players.find((p) => p.id === code.creePar)?.pseudo ?? ACTEURS_SYSTEME[code.creePar] ?? code.creePar;
}

/** Un code tiré au sort, qui n'existe pas encore. */
function tire(db: Database): string {
  for (;;) {
    const texte = Array.from(
      { length: LONGUEUR_CODE_TIRE },
      () => ALPHABET_CODES[secureInt(ALPHABET_CODES.length)],
    ).join('');
    if (!db.codesCadeaux.some((c) => c.code === texte)) return texte;
  }
}

/**
 * Crée un code, tiré au sort. Le montant et le nombre d'utilisations sont
 * revérifiés ici, quoi qu'ait accepté le schéma.
 */
export function creeCode(
  db: Database,
  reglages: { montant: number; utilisationsMax: number },
  auteur: string,
): CodeCadeau {
  const { montant, utilisationsMax } = reglages;
  if (!Number.isInteger(montant) || montant < 1 || montant > ECONOMY.soldeMax) {
    throw new CodeError(`Le montant va de 1 à ${ECONOMY.soldeMax.toLocaleString('fr-FR')} flocons.`, 'CODE_INVALIDE');
  }
  if (!Number.isInteger(utilisationsMax) || utilisationsMax < 1 || utilisationsMax > UTILISATIONS_MAX) {
    throw new CodeError(`Un code sert de 1 à ${UTILISATIONS_MAX} fois.`, 'CODE_INVALIDE');
  }

  const texte = tire(db);

  const code: CodeCadeau = {
    id: newId(),
    code: texte,
    montant,
    utilisationsMax,
    actif: true,
    creeLe: new Date().toISOString(),
    creePar: auteur,
  };
  db.codesCadeaux.push(code);
  audit(
    db,
    auteur,
    'CODE_CREE',
    null,
    `${texte} : ${montant} ❄, ${utilisationsMax} utilisation(s) au plus · créé par ${createurDuCode(db, code)}`,
  );
  return code;
}

/** Désactive un code : il ne sert plus, ce qu'il a versé reste versé. */
export function desactiveCode(db: Database, id: string, auteur: string): CodeCadeau {
  const code = db.codesCadeaux.find((c) => c.id === id);
  if (!code) throw new CodeError('Code introuvable.', 'CODE_INCONNU');
  if (code.actif) {
    code.actif = false;
    audit(db, auteur, 'CODE_DESACTIVE', null, `${code.code} · créé par ${createurDuCode(db, code)}`);
  }
  return code;
}

/**
 * Supprime un code, pour de bon : il quitte la liste et la base. Ce qu'il a
 * versé reste versé — les crédits restent au grand livre, avec sa référence —
 * et le journal garde la trace de sa création, de ses utilisations et de sa
 * suppression.
 */
export function supprimeCode(db: Database, id: string, auteur: string): { code: string; utilisations: number } {
  const code = db.codesCadeaux.find((c) => c.id === id);
  if (!code) throw new CodeError('Code introuvable.', 'CODE_INCONNU');
  const n = utilisations(db, code.id).length;
  db.codesCadeaux = db.codesCadeaux.filter((c) => c.id !== id);
  audit(
    db,
    auteur,
    'CODE_SUPPRIME',
    null,
    `${code.code} : ${code.montant} ❄, ${n} utilisation(s) sur ${code.utilisationsMax} · créé par ${createurDuCode(db, code)}`,
  );
  return { code: code.code, utilisations: n };
}

/**
 * Un joueur tape un code. Il reçoit le montant du code — moins si son solde
 * touche le plafond : le crédit s'arrête là, comme partout.
 */
export function utiliseCode(
  db: Database,
  joueurId: string,
  saisie: string,
  chaine: string,
): { code: string; montant: number; recu: number; solde: number } {
  const texte = normaliseCode(saisie);
  const code = texte ? db.codesCadeaux.find((c) => c.code === texte && c.actif) : undefined;
  if (!code) throw new CodeError('Ce code n’existe pas, ou il n’est plus actif.', 'CODE_INCONNU');

  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  if (!joueur) throw new CodeError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
  if (estLaStreameuse(joueur, chaine)) {
    throw new CodeError('La streameuse ne joue pas : les codes sont pour les joueurs.', 'STREAMEUSE');
  }
  if (code.creePar === joueurId) throw new CodeError('Tu as créé ce code : il est pour les autres.', 'SON_CODE');

  const deja = utilisations(db, code.id);
  if (deja.some((l) => l.playerId === joueurId)) throw new CodeError('Tu as déjà utilisé ce code.', 'DEJA_UTILISE');
  if (deja.length >= code.utilisationsMax) {
    throw new CodeError('Trop tard : ce code a déjà servi autant de fois que prévu.', 'CODE_EPUISE');
  }

  const avant = joueur.snowflakes;
  const solde = credit(db, joueurId, code.montant, 'CODE_CADEAU', code.id);
  audit(
    db,
    joueurId,
    'CODE_UTILISE',
    joueurId,
    `${code.code} : +${solde - avant} ❄ · créé par ${createurDuCode(db, code)}`,
  );
  return { code: code.code, montant: code.montant, recu: solde - avant, solde };
}

export interface VueCode {
  id: string;
  code: string;
  montant: number;
  utilisations: number;
  utilisationsMax: number;
  etat: EtatCode;
  creeLe: string;
  /** Le pseudo de qui l'a créé. */
  createur: string;
}

/** Les codes, le plus récent en tête, avec leurs utilisations. */
export function vueCodes(db: Readonly<Database>): VueCode[] {
  return [...db.codesCadeaux]
    .sort((a, b) => b.creeLe.localeCompare(a.creeLe))
    .map((c) => {
      const n = utilisations(db as Database, c.id).length;
      return {
        id: c.id,
        code: c.code,
        montant: c.montant,
        utilisations: n,
        utilisationsMax: c.utilisationsMax,
        etat: etatDuCode(c, n),
        creeLe: c.creeLe,
        createur: createurDuCode(db, c),
      };
    });
}
