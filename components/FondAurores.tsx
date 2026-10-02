/**
 * Le ciel de l'accueil, pour qui n'est pas connecté : la nuit des planches
 * des boosters.
 *
 * Trois rideaux d'aurore — le vert et le violet du Finisseur, le rose du
 * Folie —, des étoiles, et au ras du bas les volutes bleues du tourbillon du
 * Commu et la brume de glace du Perso. Il se pose sur le fond uni du site
 * (`FondHiver`), derrière le contenu.
 *
 * Un rideau, c'est deux calques : le ruban, une bande courbe aux bords fondus,
 * et dedans les rayons, des stries verticales tirées d'un bruit fractal, qui
 * glissent lentement le long du ruban pendant que le ruban ondule. Tout ce qui
 * bouge est une transformation ou une opacité : la carte graphique déplace des
 * calques déjà peints, rien n'est repeint. Sur un téléphone, le ciel reste
 * immobile — le verre le floute de toute façon, et chaque image animée se
 * paierait en fluidité.
 *
 * Décoratif, connecté nulle part : réservé aux pages qu'on voit sans compte,
 * où rien n'est dense à lire sur la durée.
 */
export function FondAurores() {
  return (
    <div className="fond-aurores" aria-hidden="true">
      <div className="fa-etoiles fa-etoiles-1" />
      <div className="fa-etoiles fa-etoiles-2" />
      <div className="fa-etoiles fa-etoiles-3" />
      {(['1', '2', '3'] as const).map((n) => (
        <div key={n} className={`fa-rideau fa-rideau-${n}`}>
          <div className="fa-rayons" />
        </div>
      ))}
      <div className="fa-volute fa-volute-1" />
      <div className="fa-volute fa-volute-2" />
      <div className="fa-volute fa-volute-3" />
    </div>
  );
}
