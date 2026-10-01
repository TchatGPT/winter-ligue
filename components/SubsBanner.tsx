import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { SnowCap } from '@/components/SnowCap';
import { IconImpact, IconPack, IconSnowflake } from '@/components/icons';
import { flakes } from '@/components/ui';
import type { EvenementActif } from '@/lib/db/entities';
import { EVENEMENTS_SUBS, prochainsPaliers, type PalierAVenir } from '@/lib/domain/rules';

/**
 * Le compteur de subs de la saison, et la route des paliers.
 *
 *  1. le nombre, en très grand — c'est lui qu'on vient voir ;
 *  2. ce qui tourne maintenant, s'il y a quelque chose, avec son compte à
 *     rebours ;
 *  3. la route : les quatre prochains paliers, tous genres confondus — des
 *     flocons, un booster, un évènement —, chacun avec sa jauge et ce qu'il
 *     reste à faire. Le genre se lit à la pastille avant le nom.
 *
 * Tout tombe pour **tous** les joueurs actifs ; le classement, lui, ne se
 * gagne qu'en jouant. C'est l'invariant anti-pay-to-win, et il est écrit là où
 * on regarde le nombre.
 */

const GENRES: Record<PalierAVenir['genre'], { nom: string; Icone: typeof IconSnowflake }> = {
  FLOCONS: { nom: 'Flocons', Icone: IconSnowflake },
  PACK: { nom: 'Booster', Icone: IconPack },
  EVENEMENT: { nom: 'Évènement', Icone: IconImpact },
};

export function SubsBanner({
  totalSubs,
  evenements = [],
}: {
  totalSubs: number;
  /** Les évènements en cours, du plus récent au plus ancien. */
  evenements?: EvenementActif[];
}) {
  const route = prochainsPaliers(totalSubs);

  return (
    <section className="subs-route glass @container relative px-5 py-6 sm:px-8 sm:py-6">
      <SnowCap radius="var(--r-lg)" seed="subs" />
      <div className="subs-route-lueur" aria-hidden="true" />

      <div className="relative flex h-full flex-col gap-4">
        {/* 1. Le nombre. */}
        <div className="subs-route-tete">
          <div>
            <p className="font-display text-[13px] font-bold tracking-[0.12em] text-aurora uppercase">
              Subs de la saison
            </p>
            <p className="num font-display text-[64px] leading-none font-black text-ink sm:text-[76px]">
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

        {/* 3. La route des paliers. */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] tracking-[0.12em] text-faint uppercase">Les prochains paliers</p>
            <Link href="/regles" className="text-[13px] text-ice no-underline hover:underline">
              Tous les paliers →
            </Link>
          </div>
          <ol className="subs-route-liste">
            {route.map((p, i) => {
              const { nom, Icone } = GENRES[p.genre];
              return (
                <li key={`${p.genre}-${p.every}`} className="palier" data-genre={p.genre} data-premier={i === 0 ? '' : undefined}>
                  <span className="palier-pastille" aria-hidden="true">
                    <Icone className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="palier-nom">
                      {p.label}
                      <span className="palier-genre">
                        {nom} · tous les {p.every}
                      </span>
                    </span>
                    <span className="palier-resume">{p.resume}</span>
                  </span>
                  <span className="palier-reste">
                    <span className="palier-jauge" aria-hidden="true">
                      <i style={{ width: `${Math.max(4, Math.round(p.progress * 100))}%` }} />
                    </span>
                    <span className="num">
                      dans <strong>{p.remaining}</strong> sub{p.remaining > 1 ? 's' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
