import { Meter, flakes } from '@/components/ui';
import { SUB_MILESTONES, nextMilestone } from '@/lib/domain/rules';

/**
 * Compteur de subs de la saison.
 *
 * Le point important, et il est écrit noir sur blanc dans le bandeau : les
 * récompenses de palier tombent pour **tous** les joueurs actifs. Le chat fait
 * grossir l'économie entière, il ne fait monter personne au classement — c'est
 * ce qui empêche le pay-to-win.
 */
export function SubsBanner({ totalSubs }: { totalSubs: number }) {
  const next = nextMilestone(totalSubs);
  if (!next) return null;

  return (
    <section className="panel panel-frost relative overflow-hidden px-4 py-3">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 50% 120% at 12% 50%, rgba(145,70,255,0.14) 0%, transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className="font-display text-xs font-bold tracking-[0.18em] uppercase"
              style={{ color: '#b98cff' }}
            >
              Subs de la saison
            </span>
            <span className="num font-display text-xl leading-none font-black text-ink">
              {flakes(totalSubs)}
            </span>
            <span className="text-[11px] text-faint">
              · prochain palier <strong className="text-ink">{next.milestone.label}</strong> dans{' '}
              <strong className="text-ice">{next.remaining}</strong> sub
              {next.remaining > 1 ? 's' : ''}
            </span>
          </div>

          <div className="mt-2">
            <Meter ratio={next.progress} color="#b98cff" />
          </div>

          <p className="mt-1.5 text-[11px] text-faint">
            {next.milestone.description} Chaque palier tombe pour{' '}
            <strong className="text-muted">tous les joueurs actifs à parts égales</strong> — le
            classement, lui, ne se gagne qu’en jouant.
          </p>
        </div>

        <ul className="flex shrink-0 flex-wrap gap-1.5">
          {SUB_MILESTONES.map((m) => {
            const reached = Math.floor(totalSubs / m.every);
            return (
              <li
                key={m.every}
                className="rounded-md border border-line-2 bg-bg-1/70 px-2 py-1 text-center"
                title={m.description}
              >
                <div className="num font-display text-[11px] leading-tight font-black text-ink">
                  {m.every}
                </div>
                <div className="text-[9px] tracking-wider text-faint uppercase">{m.label}</div>
                {reached > 0 && (
                  <div className="text-[9px] text-aurora">×{reached}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
