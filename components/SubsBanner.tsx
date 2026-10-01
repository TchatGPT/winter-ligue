import { Countdown } from '@/components/Countdown';
import { SnowCap } from '@/components/SnowCap';
import { Meter, flakes } from '@/components/ui';
import type { EvenementActif } from '@/lib/db/entities';
import { EVENEMENTS_SUBS, nextMilestone, prochainEvenement } from '@/lib/domain/rules';

/**
 * Le compteur de subs de la saison.
 *
 * Une seule colonne, centrée, et rien qui ne se lise en une seconde :
 *
 *  1. le nombre, en très grand — c'est lui qu'on vient voir ;
 *  2. la jauge jusqu'aux prochains flocons, avec ce qu'ils rapportent ;
 *  3. ce qui tourne maintenant, s'il y a quelque chose, avec son compte à
 *     rebours ;
 *  4. les évènements que les subs déclenchent, en cartes
 *     identiques : le palier, le nom, l'effet en trois mots, la durée. Celle du
 *     prochain à tomber est marquée.
 *
 * Tout tombe pour **tous** les joueurs actifs ; le classement, lui, ne se
 * gagne qu'en jouant. C'est l'invariant anti-pay-to-win, et il est écrit là où
 * on regarde le nombre.
 */
export function SubsBanner({
  totalSubs,
  evenements = [],
}: {
  totalSubs: number;
  /** Les évènements en cours, du plus récent au plus ancien. */
  evenements?: EvenementActif[];
}) {
  const next = nextMilestone(totalSubs);
  const prochain = prochainEvenement(totalSubs);
  if (!next || !prochain) return null;

  return (
    <section className="glass @container relative px-4 py-6 sm:px-8 sm:py-8">
      <SnowCap radius="var(--r-lg)" seed="subs" />
      {/* La teinte violette, découpée par le rayon de la plaque. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background:
            'radial-gradient(ellipse 70% 120% at 50% -20%, rgba(99,238,196,0.14) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto flex h-full max-w-4xl flex-col items-center justify-center text-center">
        {/* 1. Le nombre. */}
        <p className="font-display text-[13px] font-bold tracking-[0.12em] text-aurora uppercase">
          Subs de la saison
        </p>
        <p className="num mt-1 font-display text-[64px] leading-none font-black text-ink sm:text-[80px]">
          {flakes(totalSubs)}
        </p>

        {/* 2. Les prochains flocons. */}
        <div className="mt-5 w-full max-w-md">
          <Meter ratio={next.progress} color="#63eec4" />
          <p className="mt-2.5 text-[15px] text-ink-2">
            <strong className="text-ink">{next.milestone.label}</strong> dans{' '}
            <strong className="text-aurora">{next.remaining}</strong> sub
            {next.remaining > 1 ? 's' : ''} · {next.milestone.description}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Pour tous les joueurs actifs, à parts égales. Le classement ne se gagne qu’en jouant.
          </p>
        </div>

        {/* 3. En cours. */}
        {evenements.length > 0 && (
          <ul className="mt-6 grid w-full gap-2.5 @3xl:grid-cols-2">
            {evenements.map((e) => (
              <li
                key={e.id}
                className="glass glass-soft evenement flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className="evenement-pastille" aria-hidden="true" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] tracking-[0.12em] text-aurora uppercase">
                    En cours
                  </span>
                  <span className="block text-[15px] font-bold text-ink">
                    {e.label} ·{' '}
                    <span className="font-medium text-ink-2">
                      {/* Le texte vient de la table, pas de l'enregistrement :
                          un évènement ouvert avant une reformulation garde
                          sinon l'ancienne phrase jusqu'à sa fin. */}
                      {EVENEMENTS_SUBS.find((r) => r.kind === e.kind && r.label === e.label)
                        ?.description ?? e.description}
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

        {/* 4. Ce que les subs déclenchent. */}
        <p className="mt-7 text-[13px] tracking-[0.12em] text-faint uppercase">
          Les évènements déclenchés par les subs
        </p>
        <ul className="mt-3 grid w-full grid-cols-1 gap-2.5 @2xl:grid-cols-3">
          {EVENEMENTS_SUBS.map((e) => {
            const estProchain = e === prochain.evenement;
            const heures = e.dureeMinutes / 60;
            return (
              <li
                key={e.every}
                className={`glass glass-soft flex flex-col items-center px-3 py-4 ${
                  estProchain ? 'evenement-prochain' : ''
                }`}
              >
                <span className="text-[13px] tracking-[0.12em] text-faint uppercase">
                  Tous les {e.every} subs
                </span>
                <span className="mt-1.5 font-display text-[22px] leading-none font-black text-ink">
                  {e.label}
                </span>
                <span className="mt-2 text-[14px] font-semibold text-aurora">{e.resume}</span>
                <span className="mt-0.5 text-[13px] text-muted">
                  pendant {heures} heure{heures > 1 ? 's' : ''}
                </span>
                {estProchain && (
                  <span className="mt-2.5 rounded-full bg-aurora/15 px-2.5 py-0.5 text-[13px] font-bold text-aurora">
                    dans {prochain.remaining} sub{prochain.remaining > 1 ? 's' : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
