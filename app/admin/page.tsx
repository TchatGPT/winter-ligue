import Link from 'next/link';
import { StatTile, flakes } from '@/components/ui';
import { getStore } from '@/lib/db/store';
import { nextMilestone } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de bord — Administration' };

/**
 * Le tableau de bord : ce qu'on regarde en arrivant.
 *
 * Des chiffres, et rien à remplir. C'est délibéré — un écran d'accueil qui
 * porte un formulaire finit par recevoir des saisies faites sans le vouloir, et
 * il n'y a aucune raison que le premier écran soit celui du geste le plus
 * fréquent : celui-là a son onglet.
 */
export default async function AdminAccueilPage() {
  const data = await getStore().read((db) => {
    const actifs = db.players.filter((p) => p.active);
    const enVente = db.listings.filter((l) => l.status === 'ACTIVE').length;
    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Inconnu';

    return {
      joueurs: actifs.length,
      moderateurs: actifs.filter((p) => p.role === 'moderateur' || p.role === 'admin').length,
      games: db.games.length,
      cartes: db.cards.length,
      enVente,
      subs: db.config.totalSubs,
      shopOpen: db.config.shopOpen,
      marketOpen: db.config.marketOpen,
      reglages: db.boosterSettings.length,
      dernieres: db.audit
        .slice(-8)
        .reverse()
        .map((e) => ({ at: e.at, action: e.action, detail: e.detail })),
      derniereGame: [...db.games].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
      )[0],
      pseudo,
    };
  });

  const prochain = nextMilestone(data.subs);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Joueurs actifs" value={data.joueurs} hint={`dont ${data.moderateurs} avec des droits`} />
        <StatTile label="Games saisies" value={data.games} accent="ink" />
        <StatTile label="Cartes en circulation" value={data.cartes} accent="violet" />
        <StatTile
          label="Subs de la saison"
          value={flakes(data.subs)}
          hint={prochain ? `${prochain.milestone.label} dans ${prochain.remaining}` : 'tous franchis'}
          accent="gold"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="glass p-4 sm:p-5">
          <h2 className="font-display text-base font-black tracking-wide text-ice uppercase">
            État de la ligue
          </h2>
          <dl className="mt-3 space-y-2 text-[14px]">
            <div className="flex items-baseline justify-between gap-3 border-b border-white/8 pb-2">
              <dt className="text-faint">Boutique</dt>
              <dd className={data.shopOpen ? 'text-aurora' : 'text-danger'}>
                {data.shopOpen ? 'ouverte' : 'fermée'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/8 pb-2">
              <dt className="text-faint">Hôtel des ventes</dt>
              <dd className={data.marketOpen ? 'text-aurora' : 'text-danger'}>
                {data.marketOpen ? 'ouvert' : 'fermé'} · {data.enVente} en cours
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/8 pb-2">
              <dt className="text-faint">Boosters réglés</dt>
              <dd className={data.reglages > 0 ? 'text-gold' : 'text-muted'}>
                {data.reglages === 0 ? 'aucun — valeurs du catalogue' : `${data.reglages} modifié(s)`}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-faint">Dernière game</dt>
              <dd className="text-muted">
                {data.derniereGame
                  ? `${data.pseudo(data.derniereGame.playerId)} — ${shortDateTime(data.derniereGame.playedAt)}`
                  : 'aucune'}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/games" className="btn btn-sm btn-ice no-underline">
              Saisir une game
            </Link>
            <Link href="/admin/saison" className="btn btn-sm no-underline">
              Compteur de subs
            </Link>
          </div>
        </div>

        <div className="glass p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-black tracking-wide text-ice uppercase">
              Dernières actions
            </h2>
            <Link href="/admin/journal" className="text-[13px] text-muted no-underline hover:text-ice">
              Tout le journal →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {data.dernieres.length === 0 && <li className="text-[13px] text-faint">Rien encore.</li>}
            {data.dernieres.map((e, i) => (
              <li key={i} className="border-b border-white/8 pb-2 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-ink">{e.action.replaceAll('_', ' ')}</span>
                  <span className="text-xs whitespace-nowrap text-faint">{shortDateTime(e.at)}</span>
                </div>
                <p className="truncate text-xs text-muted">{e.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
