/**
 * Faire correspondre un nom lu sur une capture à un joueur de la ligue.
 *
 * Le tableau de fin de game donne des pseudos en jeu, avec des marques de
 * clan entre crochets, des majuscules aléatoires et parfois une lettre mal
 * lue. Le joueur, lui, est connu par son pseudo Twitch, son pseudo Activision
 * et sa chaîne. On compare le nom lu à ces trois noms, après les avoir
 * ramenés à la même forme, et l'on garde le meilleur avec sa confiance.
 *
 * Fonctions pures, sans entrée-sortie : c'est la modération qui tranche, sur
 * l'écran de saisie, avec cette confiance sous les yeux.
 */

export interface JoueurConnu {
  id: string;
  pseudo: string;
  activisionId: string | null;
  twitchLogin: string | null;
}

export interface Correspondance {
  joueurId: string | null;
  /** De 0 à 1. En dessous de `SEUIL_CONFIANCE`, aucun joueur n'est proposé. */
  confiance: number;
}

/**
 * En dessous, on préfère ne rien proposer plutôt que proposer faux. Sur des
 * pseudos de cinq lettres, trois lettres communes donnent déjà 0,4 : c'est
 * le hasard, pas une ressemblance.
 */
export const SEUIL_CONFIANCE = 0.55;

/** Retire la marque de clan : « [VI]LD » ou « [7]_MiKaa » deviennent « LD », « MiKaa ». */
export function sansTagClan(nom: string): string {
  return nom.replace(/^\s*\[[^\]]*\]\s*_?\s*/, '').trim();
}

/** Minuscules, sans le suffixe « #1234 », sans rien d'autre que lettres et chiffres. */
export function normalise(nom: string): string {
  return sansTagClan(nom)
    .replace(/#\d+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Distance de Levenshtein, sur des chaînes courtes. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const courante = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(precedente[j] + 1, courante[j - 1] + 1, precedente[j - 1] + cout);
    }
    precedente = courante;
  }
  return precedente[b.length];
}

/** Similarité de 0 à 1 entre deux noms déjà normalisés. */
export function similarite(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // L'un contient l'autre : un tag oublié, un suffixe en plus.
  if (a.includes(b) || b.includes(a)) return 0.8;
  const longueur = Math.max(a.length, b.length);
  return Math.max(0, 1 - distance(a, b) / longueur);
}

/** Les noms sous lesquels un joueur peut apparaître, normalisés. */
function nomsDe(joueur: JoueurConnu): string[] {
  return [joueur.activisionId, joueur.pseudo, joueur.twitchLogin]
    .filter((n): n is string => Boolean(n))
    .map(normalise)
    .filter(Boolean);
}

/**
 * Le joueur le plus proche du nom lu.
 *
 * Le pseudo Activision est comparé en premier et compte un peu plus : c'est
 * le nom qui est réellement sur l'écran. Une égalité stricte l'emporte sur
 * tout le reste.
 */
export function correspond(lu: string, joueurs: readonly JoueurConnu[]): Correspondance {
  const cible = normalise(lu);
  if (!cible) return { joueurId: null, confiance: 0 };

  let meilleur: Correspondance = { joueurId: null, confiance: 0 };
  for (const joueur of joueurs) {
    const noms = nomsDe(joueur);
    noms.forEach((nom, index) => {
      let score = similarite(cible, nom);
      // Le premier nom est l'Activision quand il existe : léger bonus.
      if (index === 0 && joueur.activisionId && score > 0 && score < 1) score = Math.min(0.99, score + 0.05);
      if (score > meilleur.confiance) meilleur = { joueurId: joueur.id, confiance: score };
    });
  }

  if (meilleur.confiance < SEUIL_CONFIANCE) return { joueurId: null, confiance: meilleur.confiance };
  return { joueurId: meilleur.joueurId, confiance: Math.round(meilleur.confiance * 100) / 100 };
}
