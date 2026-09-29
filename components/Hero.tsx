import Link from 'next/link';
import { CouronneGlace } from '@/components/CouronneGlace';
import { flakes } from '@/components/ui';
import { SEASON } from '@/lib/domain/rules';
import { SnowCap } from '@/components/SnowCap';

/**
 * L'accueil, en plein écran.
 *
 * ## Pourquoi un hero, et pas un titre
 *
 * La page d'accueil s'ouvrait sur « Classement général », un surtitre et cinq
 * tuiles de chiffres : une page d'administration bien tenue. Or c'est la porte
 * du site — celle qu'on ouvre depuis le chat en plein live, sur un lien lâché
 * par la streameuse. Elle a trois secondes pour dire *où l'on est* et donner
 * envie d'y rester. Une ligue, une saison, un leader, et deux gestes.
 *
 * ## Ce qui fait la scène
 *
 *  - une seule plaque de verre, large et basse, posée sur l'aurore ;
 *  - le nom en très grand, en givre, avec **un reflet qui balaie** lentement
 *    comme sur de la glace polie. Une seule fois par cycle, jamais frénétique ;
 *  - de la neige accumulée sur l'arête haute, comme sur toute plaque laissée
 *    dehors — voir `SnowCap` ;
 *  - le leader du moment : c'est la ligne que tout le monde regarde.
 */
export function Hero({
  leader,
  joueurs,
  games,
  kills,
}: {
  leader: { pseudo: string; slug: string; score: number } | null;
  joueurs: number;
  games: number;
  kills: number;
}) {
  const debut = new Date(SEASON.startsAt);
  const fin = new Date(SEASON.endsAt);
  const mois = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long' });

  return (
    <section className="hero glass glass-reflet @container relative">
      <SnowCap radius="var(--r-xl)" seed="hero" epaisseur={26} />

      <div className="relative flex h-full flex-col gap-7 px-6 py-9 sm:px-10 sm:py-12 @4xl:flex-row @4xl:items-center @4xl:justify-between @4xl:gap-10">
        <div className="min-w-0">
          <p className="eyebrow">
            {SEASON.edition} · du {debut.getDate()} {mois(debut)} au {fin.getDate()} {mois(fin)}
          </p>
          {/* Chaque mot porte son texte en `data-text` : les arêtes de la glace
              sont des pseudo-éléments qui le redessinent par-dessus. */}
          <h1 className="hero-titre mt-3">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">
            Tes kills et tes Top 1 font ton classement et rapportent des flocons. Cinq subs
            offerts, et la streameuse ouvre un booster pour toi à l’antenne : une carte, posée sur
            ta prochaine game. Les subs de la saison ouvrent des boosters pour toute la ligue. Et
            tes flocons se misent dans les duels, où le pot revient au vainqueur.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/duels" className="btn btn-ice btn-lg no-underline">
              Lancer un duel
            </Link>
            <Link href="/boosters" className="btn btn-lg no-underline">
              Voir les boosters
            </Link>
          </div>
        </div>

        {/* Le leader et les trois nombres qui disent l'échelle de la saison.
            Une colonne pleine à droite sur grand écran : le leader en grand,
            les trois nombres en dessous sur une ligne, en gros. Sous le texte
            sur petit écran, même hiérarchie. */}
        <div className="flex w-full shrink-0 flex-col gap-3 @4xl:w-[400px]">
          {leader && (
            <Link
              href={`/joueurs/${leader.slug}`}
              className="hero-leader glass glass-soft flex items-center gap-4 px-5 py-4 no-underline sm:px-6 sm:py-5"
            >
              <CouronneGlace className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" id="couronne-hero" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] tracking-[0.2em] text-faint uppercase">
                  En tête du classement
                </span>
                <span className="givre-texte block truncate pb-0.5 font-display text-[30px] leading-tight font-black sm:text-[36px]">
                  {leader.pseudo}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block font-display text-[30px] leading-none font-black text-ink sm:text-[34px]">
                  {flakes(leader.score)}
                </span>
                <span className="block text-[11px] tracking-[0.18em] text-faint uppercase">
                  points
                </span>
              </span>
            </Link>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              ['Joueurs', joueurs],
              ['Games', games],
              ['Kills', kills],
            ].map(([label, valeur]) => (
              <div
                key={String(label)}
                className="glass glass-soft flex flex-col items-center px-2 py-4 text-center sm:py-5"
              >
                <span className="num block font-display text-[32px] leading-none font-black text-ink sm:text-[38px]">
                  {flakes(Number(valeur))}
                </span>
                <span className="mt-1.5 block text-[11px] tracking-[0.2em] text-faint uppercase">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
