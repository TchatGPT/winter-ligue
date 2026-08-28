/**
 * Le décor du site : un massif himalayen, en plein écran.
 *
 * Cinq plans de crêtes en SVG occupaient cette place — une chaîne dessinée, avec
 * sa perspective atmosphérique et sa parallaxe au défilement. Elle était juste,
 * et elle avait un défaut rédhibitoire pour la direction artistique du site :
 * des aplats dégradés n'ont aucun détail fin.
 *
 * Or c'est le détail fin qui fait exister le verre. Un `backdrop-filter` ne peut
 * brouiller que ce qui varie ; mesuré sous une plaque, l'ancien fond n'offrait
 * que 1,8 niveau d'écart entre deux pixels voisins. Le verre était posé sur du
 * vide, et aucun réglage de transparence ne pouvait y changer quoi que ce soit.
 *
 * Une photo de sommet a de la roche, de la neige et des arêtes — donc de quoi
 * être flouté, réfracté, dévié. Le décor n'est plus seulement un décor : il est
 * ce qui donne sa matière au verre posé dessus.
 *
 * La composition des trois plans est faite hors ligne par
 * `scripts/compose-massif.mjs`, pas au rendu : c'est une image fixe, elle n'a
 * aucune raison de coûter du temps de composition à chaque page.
 */
export function MountainRange() {
  return (
    <div className="mountains" aria-hidden="true">
      <div className="mt-massif" />
      {/*
        Le voile.

        Sans lui le site est illisible : mesuré page par page, du texte posé
        sur la neige tombait à 2,9:1 là où il faut 4,5. Ce n'est pas un défaut
        du décor, c'est ce que fait n'importe quelle photo claire sous du texte.

        Il est dégradé plutôt qu'uniforme — plus dense en haut, où se trouvent
        les titres, et là où le contenu s'accumule — et il laisse respirer la
        bande médiane, celle où les sommets se voient le mieux à travers le
        verre.
      */}
      <div className="mt-voile" />
    </div>
  );
}
