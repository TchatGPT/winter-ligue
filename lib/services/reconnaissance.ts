import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { correspond, type JoueurConnu } from '@/lib/domain/correspondance';
import { killsDeLaLigne } from '@/lib/domain/lectureCapture';
import { GAME_LIMITS, topDePosition } from '@/lib/domain/rules';
import type { Placement } from '@/lib/domain/types';

/**
 * La lecture d'une capture de fin de game par Claude.
 *
 * Le même principe que la saisie IA de la Summer Ligue : la modération colle
 * la capture du tableau de fin de game, le modèle lit chaque ligne — pseudo,
 * éliminations, assists — et fait correspondre les pseudos à la liste des
 * joueurs qu'on lui donne. Ce qui revient n'est qu'une **proposition** : la
 * modération la relit, corrige, puis enregistre chaque game par la route
 * habituelle, qui recalcule le score. Rien de ce que lit le modèle ne
 * touche la base directement.
 *
 * L'appel se fait ici, côté serveur : la clé d'API ne quitte jamais le
 * serveur, et la CSP du site n'autorise de toute façon aucun appel sortant
 * depuis le navigateur.
 */

export const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Ce que le modèle doit renvoyer : les en-têtes des colonnes et, ligne par
 * ligne, les nombres tels qu'ils sont écrits (23/11/2026). Le modèle ne décide
 * plus quelle colonne fait les kills — il confondait ÉLIM./ASSIST. et ÉLIM. :
 * `killsDeLaLigne` le fait ici.
 */
const Lecture = z.object({
  /** La position de l'escouade si la capture la montre, sinon null. */
  placement: z.number().int().min(1).max(200).nullable(),
  /** Les en-têtes des colonnes après NOM, de gauche à droite, tels qu'écrits. */
  entetes: z.array(z.string()),
  joueurs: z.array(
    z.object({
      /** Le pseudo tel qu'il est écrit sur l'écran, marque de clan comprise. */
      lu: z.string(),
      /** Les nombres de la ligne, un par en-tête, dans le même ordre ; null si illisible. */
      valeurs: z.array(z.number().int().min(0).nullable()),
      /** Les éliminations directes selon le modèle : ne sert que si les en-têtes manquent. */
      kills: z.number().int().min(0).max(200),
      /** L'identifiant du joueur de la ligue reconnu, ou null. */
      joueurId: z.string().nullable(),
    }),
  ),
});

export interface Proposition {
  /** Vrai pour la ligne de la streameuse : jamais de game. */
  streameuse: boolean;
  lu: string;
  kills: number;
  assists: number | null;
  /**
   * Les kills que donnent les deux autres colonnes : ÉLIM./ASSIST. moins
   * ASSIST. — ce sont eux que la saisie retient (23/11/2026). Nul si la
   * capture n'a pas ces colonnes.
   */
  attendu: number | null;
  /** La colonne ÉLIM., lue à part : elle doit tomber sur `attendu`, sinon l'écran le dit. */
  elim: number | null;
  joueurId: string | null;
  /** De 0 à 1 : 1 quand le modèle et la comparaison de noms sont d'accord. */
  confiance: number;
}

export interface Analyse {
  placement: Placement;
  propositions: Proposition[];
  modele: string;
}

export function isReconnaissanceEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Claude Haiku 4.5 par défaut, comme la Summer Ligue : lire un tableau de
 * quatre lignes n'a pas besoin de réflexion, et la réponse arrive en quelques
 * secondes au lieu de plusieurs dizaines. `ANTHROPIC_MODEL` permet d'en
 * essayer un autre.
 */
function modele(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5';
}

function consigne(joueurs: readonly JoueurConnu[], streameuse: JoueurConnu): string {
  const liste = joueurs
    .map((j) => {
      const noms = [j.activisionId && `pseudo en jeu : ${j.activisionId}`, j.twitchLogin && `Twitch : ${j.twitchLogin}`]
        .filter(Boolean)
        .join(', ');
      return `- id ${j.id} — ${j.pseudo}${noms ? ` (${noms})` : ''}`;
    })
    .join('\n');

  return `Capture d'écran de fin de game Call of Duty Warzone (ou Résurgence).

Joueurs de la ligue :
${liste}

La streameuse, ${streameuse.pseudo}${streameuse.activisionId ? ` (pseudo en jeu : ${streameuse.activisionId})` : ''}, joue dans l'escouade mais n'est PAS dans la ligue : mets toujours joueurId à null pour sa ligne.

Lis le tableau des joueurs de l'escouade, colonne par colonne, sans rien calculer. Les colonnes, de gauche à droite, sont en général : NOM | SCORE | ÉLIM./ASSIST. | ÉLIM. | ASSIST.
- entetes = les en-têtes des colonnes qui suivent NOM, de gauche à droite, recopiés tels qu'ils sont écrits (par exemple ["SCORE", "ÉLIM./ASSIST.", "ÉLIM.", "ASSIST."]).
- valeurs = pour chaque joueur, les nombres de ces colonnes, dans le même ordre que entetes, un par en-tête (null si un nombre est illisible). Attention : ÉLIM./ASSIST. et ÉLIM. sont deux colonnes différentes, côte à côte ; recopie chacune dans sa case.
- kills = la colonne ÉLIM. seule, au cas où les en-têtes seraient illisibles.
- Retourne toutes les lignes de joueurs, y compris celles grisées (joueur déconnecté), sauf la ligne « TOTAUX ESCOUADE ».
- Ce qui est entre crochets devant un pseudo est une marque de clan, pas le pseudo : « [VI]LD » se lit « LD », « [ # ]亅乇乇メヨ » se lit « 亅乇乇メヨ ». Ne t'en sers jamais pour reconnaître un joueur. Recopie quand même le nom complet dans « lu ».
- Les pseudos peuvent être écrits avec des caractères d'autres alphabets qui imitent des lettres : recopie-les tels quels.
- Pour chaque ligne, cherche le joueur de la ligue qui correspond, en priorité par son pseudo en jeu, puis par son pseudo ou sa chaîne Twitch. Mets son id dans joueurId, ou null si aucun ne convient. Ne devine pas.
- placement : la position de l'escouade si la capture la montre clairement (« VICTOIRE » = 1, « #1 », « 2e », « #7 »…), sinon null.`;
}

/**
 * Lit la capture et renvoie les propositions, joueur par joueur.
 *
 * `image` est le contenu en base64, sans préfixe `data:`. Les erreurs de
 * l'API remontent telles quelles : la route les traduit.
 */
export async function analyseCapture(
  image: string,
  mediaType: MediaType,
  joueurs: readonly JoueurConnu[],
  streameuse: JoueurConnu,
): Promise<Analyse> {
  const client = new Anthropic();
  const nomModele = modele();
  // Haiku 4.5 n'accepte pas le réglage d'effort ; les autres modèles le
  // prennent au plus bas, la lecture n'en demande pas plus.
  const effort = nomModele.startsWith('claude-haiku') ? {} : { effort: 'low' as const };

  const reponse = await client.messages.parse({
    model: nomModele,
    max_tokens: 1500,
    output_config: { ...effort, format: zodOutputFormat(Lecture) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: consigne(joueurs, streameuse) },
        ],
      },
    ],
  });

  const lecture = reponse.parsed_output;
  if (!lecture) {
    throw new Error('Le modèle n’a pas renvoyé une lecture exploitable.');
  }

  const connus = new Set(joueurs.map((j) => j.id));
  const propositions: Proposition[] = lecture.joueurs.map((ligne) => {
    // Les kills : ÉLIM./ASSIST. − ASSIST., contrôlés par ÉLIM. (`killsDeLaLigne`).
    const lus = killsDeLaLigne(lecture.entetes, ligne.valeurs, ligne.kills);
    const kills = Math.min(GAME_LIMITS.maxKills, Math.max(GAME_LIMITS.minKills, lus.kills ?? ligne.kills));
    const { attendu, elim } = lus;
    const assists = lus.assists;
    // La streameuse d'abord : sa ligne est reconnue par son nom, et n'est
    // jamais attribuée — quoi qu'en dise le modèle.
    if (correspond(ligne.lu, [streameuse]).joueurId !== null) {
      return { streameuse: true, lu: ligne.lu, kills, assists, attendu, elim, joueurId: null, confiance: 0 };
    }
    // Le modèle propose un id ; la comparaison de noms le confirme ou le
    // remplace. Un id qui n'est pas dans la liste est ignoré : il n'a pas
    // pu venir de nous.
    const parNom = correspond(ligne.lu, joueurs);
    const duModele = ligne.joueurId && connus.has(ligne.joueurId) ? ligne.joueurId : null;
    let joueurId: string | null;
    let confiance: number;
    if (duModele && parNom.joueurId === duModele) {
      joueurId = duModele;
      confiance = 1;
    } else if (duModele) {
      joueurId = duModele;
      confiance = Math.max(0.6, parNom.confiance);
    } else {
      joueurId = parNom.joueurId;
      confiance = parNom.confiance;
    }
    return { streameuse: false, lu: ligne.lu, kills, assists, attendu, elim, joueurId, confiance };
  });

  return { placement: topDePosition(lecture.placement), propositions, modele: nomModele };
}
