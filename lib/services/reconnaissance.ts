import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { correspond, type JoueurConnu } from '@/lib/domain/correspondance';
import { GAME_LIMITS } from '@/lib/domain/rules';

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

/** Ce que le modèle doit renvoyer, ligne par ligne. */
const Lecture = z.object({
  /** Le classement de l'escouade si le tableau le montre, sinon null. */
  placement: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  joueurs: z.array(
    z.object({
      /** Le pseudo tel qu'il est écrit sur l'écran, marque de clan comprise. */
      lu: z.string(),
      /** Les éliminations directes (colonne ÉLIM.). */
      kills: z.number().int().min(0).max(200),
      /** La colonne ASSIST., si elle existe. */
      assists: z.number().int().min(0).max(200).nullable(),
      /** L'identifiant du joueur de la ligue reconnu, ou null. */
      joueurId: z.string().nullable(),
    }),
  ),
});

export interface Proposition {
  lu: string;
  kills: number;
  assists: number | null;
  joueurId: string | null;
  /** De 0 à 1 : 1 quand le modèle et la comparaison de noms sont d'accord. */
  confiance: number;
}

export interface Analyse {
  placement: 1 | 2 | 3 | null;
  propositions: Proposition[];
  modele: string;
}

export function isReconnaissanceEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function modele(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5';
}

function consigne(joueurs: readonly JoueurConnu[]): string {
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

Lis le tableau des joueurs de l'escouade. Les colonnes, de gauche à droite, sont en général : NOM | SCORE | ÉLIM./ASSIST. | ÉLIM. | ASSIST. Certaines captures n'ont qu'une colonne ÉLIM.
- Ignore SCORE et ÉLIM./ASSIST.
- kills = la colonne ÉLIM. (les éliminations directes). Si seule une colonne ÉLIM./ASSIST. existe, kills = cette valeur moins ASSIST. quand ASSIST. existe, sinon cette valeur.
- assists = la colonne ASSIST. si elle existe, sinon null.
- Retourne toutes les lignes de joueurs, y compris celles grisées (joueur déconnecté), sauf la ligne « TOTAUX ESCOUADE ».
- Ce qui est entre crochets devant un pseudo est une marque de clan, pas le pseudo : « [VI]LD » se lit « LD ». Recopie quand même le nom complet dans « lu ».
- Pour chaque ligne, cherche le joueur de la ligue qui correspond, en priorité par son pseudo en jeu, puis par son pseudo ou sa chaîne Twitch. Mets son id dans joueurId, ou null si aucun ne convient. Ne devine pas.
- placement : 1, 2 ou 3 si la capture montre clairement que l'escouade a fini première, deuxième ou troisième (« VICTOIRE », « #1 », « 2e »…), sinon null.`;
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
): Promise<Analyse> {
  const client = new Anthropic();
  const nomModele = modele();

  const reponse = await client.messages.parse({
    model: nomModele,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: zodOutputFormat(Lecture) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: consigne(joueurs) },
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
    const kills = Math.min(GAME_LIMITS.maxKills, Math.max(GAME_LIMITS.minKills, ligne.kills));
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
    return { lu: ligne.lu, kills, assists: ligne.assists, joueurId, confiance };
  });

  return { placement: lecture.placement, propositions, modele: nomModele };
}
