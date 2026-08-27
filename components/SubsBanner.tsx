import { Meter, flakes } from '@/components/ui';
import { SUB_MILESTONES, nextMilestone } from '@/lib/domain/rules';

/**
 * Compteur de subs de la saison.
 *
 * Le point important est écrit noir sur blanc dans le bandeau : les récompenses
 * de palier tombent pour **tous** les joueurs actifs. Le chat fait grossir
 * l'économie entière, il ne fait monter personne au classement — c'est ce qui
 * empêche le pay-to-win, et ça doit se lire sans aller chercher les règles.
 */
export function SubsBanner({ totalSubs }: { totalSubs: number }) {
  const next = nextMilestone(totalSubs);
  if (!next) return null;

  return (
    <section className="glass relative overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 140% at 10% 50%, rgba(169,140,255,0.18) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-sm font-bold tracking-[0.18em] text-violet uppercase">
              Subs de la saison
            </span>
            <span className="num font-display text-3xl leading-none font-black text-ink">
              {flakes(totalSubs)}
            </span>
          </div>

          <p className="mt-1 text-[15px] text-ink-2">
            Prochain palier <strong className="text-ink">{next.milestone.label}</strong> dans{' '}
            <strong className="text-ice">{next.remaining}</strong> sub
            {next.remaining > 1 ? 's' : ''}
          </p>

          <div className="mt-3">
            <Meter ratio={next.progress} color="#a98cff" />
          </div>

          <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
            {next.milestone.description} Chaque palier tombe pour{' '}
            <strong className="text-ink-2">tous les joueurs actifs à parts égales</strong> — le
            classement, lui, ne se gagne qu’en jouant.
          </p>
        </div>

        <ul className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[340px]">
          {SUB_MILESTONES.map((m) => {
            const reached = Math.floor(totalSubs / m.every);
            return (
              <li
                key={m.every}
                className="glass glass-soft px-2 py-2.5 text-center"
                title={m.description}
              >
                <div className="num font-display text-lg leading-tight font-black text-ink">
                  {m.every}
                </div>
                <div className="mt-0.5 text-[11px] leading-tight tracking-wide text-faint uppercase">
                  {m.label}
                </div>
                {reached > 0 && (
                  <div className="mt-0.5 text-[13px] font-bold text-aurora">×{reached}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
