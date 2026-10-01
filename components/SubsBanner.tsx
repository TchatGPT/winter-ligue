import { Countdown } from '@/components/Countdown';
import { EmblemePalier, type GlyphePalier } from '@/components/EmblemePalier';
import { SnowCap } from '@/components/SnowCap';
import { flakes } from '@/components/ui';
import type { EvenementActif } from '@/lib/db/entities';
import { GEMME_DU_PACK, RARITY_META } from '@/lib/domain/catalog';
import { departAccelere, EVENEMENTS_SUBS, paliersDuCompteur, type PalierAVenir } from '@/lib/domain/rules';

/**
 * Le compteur de subs de la saison, et ce que les subs font tomber.
 *
 *  1. le nombre, en très grand — c'est lui qu'on vient voir ;
 *  2. ce qui tourne maintenant, s'il y a quelque chose, avec son compte à
 *     rebours ;
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
function blason(p: PalierAVenir): { glyphe: GlyphePalier; teinte: string } {
  if (p.genre === 'PACK' && p.packId) return { glyphe: 'booster', teinte: RARITY_META[GEMME_DU_PACK[p.packId]].color };
  if (p.kind === 'COMMU_ACCELERE') return { glyphe: 'tempete', teinte: 'var(--ice)' };
  return { glyphe: 'flocons', teinte: 'var(--aurora)' };
}

export function SubsBanner({
  totalSubs,
  evenements = [],
}: {
  totalSubs: number;
  /** Les évènements en cours, du plus récent au plus ancien. */
  evenements?: EvenementActif[];
}) {
  const tempete = evenements.find((e) => e.kind === 'COMMU_ACCELERE');
  const paliers = paliersDuCompteur(totalSubs, tempete ? departAccelere(tempete.declencheA) : null);
  const plusProche = Math.min(...paliers.map((p) => p.remaining));

  return (
    <section className="subs-route glass @container relative px-5 pt-10 pb-6 sm:px-8 sm:pt-11">
      <SnowCap radius="var(--r-lg)" seed="subs" />
      <div className="subs-route-lueur" aria-hidden="true" />

      <div className="relative flex h-full flex-col gap-5">
        {/* 1. Le nombre. */}
        <div className="subs-route-tete">
          <div>
            <p className="font-display text-[13px] font-bold tracking-[0.12em] text-aurora uppercase">
              Subs de la saison
            </p>
            <p className="num mt-1 font-display text-[64px] leading-none font-black text-ink sm:text-[76px]">
              {flakes(totalSubs)}
            </p>
          </div>
          <p className="subs-route-regle">
            Tout tombe pour tous les joueurs actifs, à parts égales. Le classement ne se gagne qu’en jouant.
          </p>
        </div>

        {/* 2. En cours. */}
        {evenements.length > 0 && (
          <ul className="grid w-full gap-2.5 @3xl:grid-cols-2">
            {evenements.map((e) => (
              <li key={e.id} className="glass glass-soft evenement flex items-center gap-3 px-4 py-3 text-left">
                <span className="evenement-pastille" aria-hidden="true" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] tracking-[0.12em] text-aurora uppercase">En cours</span>
                  <span className="block text-[15px] font-bold text-ink">
                    {e.label} ·{' '}
                    <span className="font-medium text-ink-2">
                      {/* Le texte vient de la table, pas de l'enregistrement :
                          un évènement ouvert avant une reformulation garde
                          sinon l'ancienne phrase jusqu'à sa fin. */}
                      {EVENEMENTS_SUBS.find((r) => r.kind === e.kind && r.label === e.label)?.description ??
                        e.description}
                    </span>
                  </span>
                </span>
                <span className="num ml-2 font-display text-[20px] leading-none font-black whitespace-nowrap text-ink tabular-nums">
                  <Countdown endsAt={e.endsAt} />
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 3. Les paliers. */}
        <div>
          <p className="text-[13px] tracking-[0.12em] text-faint uppercase">Ce que les subs font tomber</p>
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
                      <span className="palier-dans num">
                        dans <strong>{p.remaining}</strong>
                      </span>
                    </div>
                    <div className="palier-pied">
                      <span className="palier-jauge" aria-hidden="true">
                        <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
                      </span>
                      <span className="palier-resume">{p.resume}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
