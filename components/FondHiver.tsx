/**
 * Le décor du site : de la glace sous un ciel de néon.
 *
 * Des lueurs vives — glace, violet Twitch, aurore — qui se fondent, un réseau
 * de facettes de glace par-dessus (`public/fond/eclats.svg`, un lac gelé vu
 * d'en haut, fendu vers un point d'impact), un grain de pellicule et un
 * vignettage. Les plaques de verre du site laissent passer ces couleurs :
 * c'est sur un fond vif que le verre dépoli se lit.
 *
 * Tout est immobile, et c'est voulu : un décor qui bouge oblige le navigateur à
 * refaire chaque flou de verre à chaque image, et le site ramait. Tout se règle
 * dans `app/globals.css`, sous « LE DÉCOR ».
 */
export function FondHiver() {
  return (
    <div className="fond-hiver" aria-hidden="true">
      <div className="fh-eclats" />
      <div className="fh-grain" />
      <div className="fh-voile" />
    </div>
  );
}
