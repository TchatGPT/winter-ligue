import 'server-only';

/**
 * Les évènements déclenchés par les subs.
 *
 * À certains paliers de subs, quelque chose se met à tourner pour **tout le
 * monde**, pendant une heure ou deux : les flocons doublés, les cartes plus
 * fortes. Puis ça s'arrête.
 *
 * ## Pourquoi c'est compatible avec l'invariant anti-pay-to-win
 *
 * Un évènement est collectif et borné dans le temps. Il ne verse rien à
 * personne en particulier : il change les *règles* pour tous les joueurs actifs
 * pendant sa fenêtre, exactement comme les boosters de la ligue tombent pour tous.
 * Celui qui a déclenché le palier n'en tire pas plus que les autres — et
 * pendant une fenêtre « flocons doublés », le meilleur joueur gagne toujours
 * deux fois plus que le moins bon, ni plus ni moins qu'en temps normal.
 *
 * ## Où les effets s'appliquent
 *
 * En un seul endroit chacun, et c'est le point qui compte :
 *
 *  - le **gain** d'une game dans la route qui l'enregistre ;
 *  - la **force** des cartes dans `applyPoints`, avant le plafond — le plafond
 *    reste, un évènement ne le fait pas sauter.
 *
 * Les facteurs ne se **cumulent pas** : deux évènements du même genre actifs en
 * même temps donnent le plus fort des deux, pas leur produit. Sans cette règle,
 * deux Avalanches feraient des flocons quadruplés, ce qu'aucun palier n'annonce.
 */

import type { Database, EvenementActif } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import {
  departAccelere,
  type EvenementKind,
  EVENEMENTS_SUBS,
  evenementsDeclenches,
  facteurEvenement,
} from '@/lib/domain/rules';

/** Les évènements en cours à l'instant donné, du plus récent au plus ancien. */
export function evenementsActifs(db: Database, now = new Date()): EvenementActif[] {
  const t = now.getTime();
  return db.evenements
    .filter((e) => new Date(e.startsAt).getTime() <= t && new Date(e.endsAt).getTime() > t)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/**
 * Déclenche les évènements dont un palier vient d'être franchi.
 *
 * Un même palier franchi deux fois dans une seule saisie (par exemple +120 subs
 * d'un coup sur un palier de 50) déclenche l'évènement une fois par
 * franchissement, mais les fenêtres se **suivent** au lieu de se superposer :
 * la deuxième commence quand la première finit. Sinon deux franchissements
 * feraient exactement le même effet qu'un seul, et le chat aurait payé pour
 * rien.
 */
export function declencheEvenements(
  db: Database,
  from: number,
  to: number,
  now = new Date(),
): EvenementActif[] {
  const declenches = evenementsDeclenches(from, to);
  const crees: EvenementActif[] = [];

  for (const regle of declenches) {
    // La fenêtre commence à la fin de la dernière du même genre si elle court
    // encore, sinon maintenant.
    const enCours = db.evenements
      .filter((e) => e.kind === regle.kind && new Date(e.endsAt).getTime() > now.getTime())
      .sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
    const debut = enCours ? new Date(enCours.endsAt) : now;
    const fin = new Date(debut.getTime() + regle.dureeMinutes * 60_000);

    const evenement: EvenementActif = {
      id: newId(),
      kind: regle.kind,
      label: regle.label,
      description: regle.description,
      startsAt: debut.toISOString(),
      endsAt: fin.toISOString(),
      declencheA: to,
    };
    db.evenements.push(evenement);
    crees.push(evenement);
  }

  return crees;
}

/** Le facteur en vigueur pour un genre d'effet : 1 s'il n'y a rien. */
function facteur(db: Database, kind: EvenementKind, now: Date): number {
  return facteurEvenement(
    kind,
    evenementsActifs(db, now).map((e) => e.kind),
  );
}

/** Flocons d'une game : 2 pendant une avalanche, 1 sinon. */
export const facteurGain = (db: Database, now = new Date()) => facteur(db, 'FLOCONS_DOUBLES', now);

/** Points d'une carte : 1,5 pendant un blizzard, 1 sinon. */
export const facteurCartes = (db: Database, now = new Date()) =>
  facteur(db, 'CARTES_RENFORCEES', now);

/**
 * Pendant une Tempête, le total d'où le Booster Commu accéléré compte — le
 * palier de 500 qui l'a ouverte. Null s'il n'y a pas de Tempête en cours.
 */
export function commuAccelereDepuis(db: Database, now = new Date()): number | null {
  const tempete = evenementsActifs(db, now).find((e) => e.kind === 'COMMU_ACCELERE');
  return tempete ? departAccelere(tempete.declencheA) : null;
}

/** Ce que le bandeau affiche : les évènements en cours et la table des paliers. */
export function evenementsOverview(db: Database, now = new Date()) {
  return {
    actifs: evenementsActifs(db, now),
    paliers: EVENEMENTS_SUBS,
  };
}
