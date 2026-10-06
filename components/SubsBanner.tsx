import { EmblemePalier, type GlyphePalier } from '@/components/EmblemePalier';
import { SnowCap } from '@/components/SnowCap';
import { flakes } from '@/components/ui';
import type { EvenementActif } from '@/lib/db/entities';
import { GEMME_DU_PACK, RARITY_META } from '@/lib/domain/catalog';
import { departAccelere, paliersDuCompteur, type PalierAVenir } from '@/lib/domain/rules';

/**
 * Le compteur de subs de la saison, et ce que les subs font tomber.
 *
 *  1. le nombre, en très grand — c'est lui qu'on vient voir ;
 *  2. (ce qui tourne maintenant n'est plus ici : c'est la mini-bannière du
 *     haut du site, `EvenementsFlottants`) ;
 *  3. les paliers, à la manière des taux de rareté : les boosters de la ligue
 *     et les évènements, chacun sa médaille, sa teinte, sa jauge creusée et ce
 *     qu'il reste à faire. Le plus proche est marqué. Pendant une Tempête, le
 *     Booster Commu suit son palier accéléré.
 *
 * Tout tombe pour **tous** les joueurs actifs ; le classement, lui, ne se
 * gagne qu'en jouant. C'est l'invariant anti-pay-to-win, et il est écrit là où
 * on regarde le nombre.
 */

/** La médaille et la teinte d'un palier : celles du booster, ou de l'évènement. */
export function blason(p: PalierAVenir): { glyphe: GlyphePalier; teinte: string } {
  if (p.genre === 'PACK' && p.packId) return { glyphe: 'booster', teinte: RARITY_META[GEMME_DU_PACK[p.packId]].color };
  if (p.kind === 'COMMU_ACCELERE') return { glyphe: 'tempete', teinte: 'var(--ice)' };
  return { glyphe: 'flocons', teinte: 'var(--aurora)' };
}

export function SubsBanner({
  totalSubs,
  evenements = [],
}: {
  totalSubs: number;
  /** Les évènements en cours : une Tempête de neige accélère le Booster Commu. */
  evenements?: EvenementActif[];
}) {
  return (
    <section className="subs-route glass relative px-5 pt-10 pb-6 sm:px-8 sm:pt-11 4xl:pt-9 4xl:pb-5">
      <SnowCap radius="var(--r-lg)" seed="subs" />
      <div className="subs-route-lueur" aria-hidden="true" />

      <div className="relative flex h-full flex-col gap-5 4xl:gap-4">
        {/* 1. Le nombre. */}
        <div className="subs-route-tete">
          <div>
            <p className="font-display text-[13px] font-bold tracking-[0.12em] text-aurora uppercase">
              Subs de la saison
            </p>
            <p className="num mt-1 font-display text-[64px] leading-none font-black text-ink sm:text-[76px] 4xl:text-[56px]">
              {flakes(totalSubs)}
            </p>
          </div>
          <p className="subs-route-regle">
            Tout tombe pour tous les joueurs actifs, à parts égales. Le classement ne se gagne qu’en jouant.
          </p>
        </div>

        {/* 3. Les paliers. */}
        <div className="subs-route-paliers">
          <p className="text-[13px] tracking-[0.12em] text-faint uppercase">Ce que les subs font tomber</p>
          <PaliersSubs totalSubs={totalSubs} evenements={evenements} />
        </div>
      </div>
    </section>
  );
}

/** Les paliers du compteur, quand une Tempête de neige accélère le Booster Commu ou non. */
export function paliersEnCours(totalSubs: number, evenements: EvenementActif[] = []): PalierAVenir[] {
  const tempete = evenements.find((e) => e.kind === 'COMMU_ACCELERE');
  return paliersDuCompteur(totalSubs, tempete ? departAccelere(tempete.declencheA) : null);
}

/**
 * Les paliers, un par ligne : la médaille, le nom dans sa teinte, « tous les
 * N », le décompte et la jauge creusée. Le plus proche est marqué. Sur
 * l'accueil, et dans le tableau de bord de la modération.
 */
export function PaliersSubs({ totalSubs, evenements = [] }: { totalSubs: number; evenements?: EvenementActif[] }) {
  const paliers = paliersEnCours(totalSubs, evenements);
  const plusProche = Math.min(...paliers.map((p) => p.remaining));
  return (
    <ul className="subs-route-liste">
      {paliers.map((p) => {
        const { glyphe, teinte } = blason(p);
        const cle = `${p.genre}-${p.packId ?? p.kind}`;
        return (
          <li
            key={cle}
            className="palier"
            style={{ ['--teinte' as string]: teinte }}
            data-premier={p.remaining === plusProche ? '' : undefined}
          >
            <EmblemePalier glyphe={glyphe} teinte={teinte} id={cle} className="palier-embleme" />
            <div className="palier-corps">
              <div className="palier-tete">
                <span className="palier-nom">{p.label}</span>
                <span className="palier-tous">tous les {p.every}</span>
                {p.accelere && <span className="palier-badge">Tempête de neige</span>}
                <span className="palier-dans num">
                  dans <strong>{p.remaining}</strong>
                </span>
              </div>
              {p.explication && <p className="palier-explication">{p.explication}</p>}
              <div className="palier-pied">
                <span className="palier-jauge" aria-hidden="true">
                  <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </span>
                <span className="palier-resume">subs</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
