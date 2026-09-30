/**
 * Le décor du site : une aurore boréale figée au-dessus du massif.
 *
 * Tout est immobile, et c'est voulu. Le site est fait de plaques de verre
 * floutées : quand le décor bougeait — une neige WebGL plein écran —, chaque
 * image obligeait le navigateur à refaire tous les flous, et le site ramait. Un
 * décor fixe se peint une fois ; les flous ne se refont plus qu'au défilement.
 *
 * Du fond vers l'avant : le ciel de nuit, l'aurore et ses rideaux de lumière,
 * les étoiles, le massif (`public/fond/massif.webp`, servi par le site) dans sa
 * brume, puis le voile qui garantit la lisibilité du contenu. Tout se règle
 * dans `app/globals.css`, sous « LE DÉCOR ».
 */
export function FondHiver() {
  return (
    <div className="fond-hiver" aria-hidden="true">
      <div className="fh-aurore" />
      <div className="fh-rideaux" />
      <div className="fh-etoiles" />
      <div className="fh-massif" />
      <div className="fh-brume" />
      <div className="fh-voile" />
    </div>
  );
}
