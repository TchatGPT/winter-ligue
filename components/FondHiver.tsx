/**
 * Le décor du site : une nuit d'hiver.
 *
 * Du haut vers le bas : le dégradé du ciel semé d'étoiles, les rideaux d'une
 * aurore boréale, une chaîne de montagnes enneigées, puis la neige en
 * congères. Un grain de pellicule et un vignettage par-dessus. Les plaques de
 * verre du site laissent passer ces couleurs : c'est sur un fond vif que le
 * verre dépoli se lit.
 *
 * Les trois images (`public/fond/etoiles.svg`, `aurore.svg`, `montagnes.svg`)
 * sortent de `scripts/paysage.mjs` ; le ciel est un dégradé CSS. Tout est
 * immobile, et c'est voulu : un décor qui bouge oblige le navigateur à refaire
 * chaque flou de verre à chaque image, et le site ramait. Tout se règle dans
 * `app/globals.css`, sous « LE DÉCOR ».
 */
export function FondHiver() {
  return (
    <div className="fond-hiver" aria-hidden="true">
      <div className="fh-etoiles" />
      <div className="fh-aurore" />
      <div className="fh-montagnes" />
      <div className="fh-grain" />
      <div className="fh-voile" />
    </div>
  );
}
