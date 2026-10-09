/**
 * Le message du tchat qui annonce une ouverture de booster, une fois la carte
 * révélée à l'écran du stream.
 *
 *  - « 🎁 Booster Perso ouvert ! @jeex3 a obtenu la carte Congère (Commune),
 *    qui fait : +3 points sur ta prochaine game. »
 *  - « 📣 Booster Commu ouvert ! @a, @b et @c ont obtenu la carte Percée
 *    (Rare), qui fait : +8 pts bonus. »
 *  - « 🌪 Booster Folie ouvert ! Toute la ligue a obtenu la carte … »
 *
 * Fonction pure : le texte se compose ici, d'après la base, jamais d'après ce
 * qu'enverrait un navigateur. Un joueur se nomme par son @ Twitch, à défaut
 * par son pseudo.
 */

export interface AnnonceOuverture {
  booster: { nom: string; glyphe: string };
  carte: {
    nom: string;
    /** Sa rareté, en toutes lettres : « Commune ». */
    rarete: string;
    /** Ce qu'elle fait, à la deuxième personne : « +3 points sur ta prochaine game. » */
    description: string;
    /** L'intitulé de son action, pour plusieurs joueurs : « +3 pts bonus ». */
    action: string;
  };
  /** Sur qui la carte tombe. */
  gagnants: { pseudo: string; twitchLogin: string | null }[];
  /** Elle tombe sur toute la ligue. */
  touteLaLigue: boolean;
}

/** Au-delà, on compte les autres au lieu de les nommer. */
export const NOMMES_MAX = 5;

/** Twitch coupe un message à 500 caractères. */
export const LONGUEUR_MESSAGE_MAX = 500;

const sansPointFinal = (texte: string) => texte.trim().replace(/[.\s]+$/, '');

/** « @a », « @a et @b », « @a, @b et @c », « @a, …, @e et 3 autres ». */
function liste(noms: string[]): string {
  const nommes = noms.slice(0, NOMMES_MAX);
  const autres = noms.length - nommes.length;
  if (autres > 0) return `${nommes.join(', ')} et ${autres} autre${autres > 1 ? 's' : ''}`;
  if (nommes.length <= 1) return nommes.join('');
  return `${nommes.slice(0, -1).join(', ')} et ${nommes.at(-1)}`;
}

export function messageOuverture(a: AnnonceOuverture): string {
  const tete = `${a.booster.glyphe} ${a.booster.nom} ouvert !`;
  const carte = `la carte ${a.carte.nom} (${a.carte.rarete})`;
  const nom = (g: AnnonceOuverture['gagnants'][number]) => (g.twitchLogin ? `@${g.twitchLogin}` : g.pseudo);

  let message: string;
  if (a.touteLaLigue || a.gagnants.length === 0) {
    message = `${tete} Toute la ligue a obtenu ${carte}, qui fait : ${sansPointFinal(a.carte.action)}.`;
  } else if (a.gagnants.length === 1) {
    message = `${tete} ${nom(a.gagnants[0])} a obtenu ${carte}, qui fait : ${sansPointFinal(a.carte.description)}.`;
  } else {
    message = `${tete} ${liste(a.gagnants.map(nom))} ont obtenu ${carte}, qui fait : ${sansPointFinal(a.carte.action)}.`;
  }
  return message.slice(0, LONGUEUR_MESSAGE_MAX);
}
