import { BoosterOpening, type CatalogCard, type ShopBooster } from '@/components/BoosterOpening';
import { CardTile, PageHead, RarityChip } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { BOOSTERS, CARDS, cardsOfRarity, RARITY_META } from '@/lib/domain/catalog';
import { ECONOMY } from '@/lib/domain/rules';
import { RARITIES } from '@/lib/domain/types';
import { statsForCard } from '@/lib/services/market';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boosters' };



/**
 * Boosters : achat, ouverture en 3D, et catalogue complet des 24 cartes.
 *
 * Le catalogue est rangé par rareté : c'est le seul classement d'une carte
 * depuis que les familles ont été retirées, et c'est aussi la seule chose
 * qu'un booster promet.
 */
export default async function BoostersPage() {
  const session = await getSession();
  const playerId = session?.role === 'joueur' ? session.sub : null;

  const { balance, shopOpen, quotes } = await getStore().read((db) => ({
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
    shopOpen: db.config.shopOpen,
    // Cote de chaque carte, pour que le catalogue affiche une valeur de marché.
    quotes: Object.fromEntries(
      CARDS.map((c) => [c.id, statsForCard(db, c.id).lastPrice]),
    ) as Record<string, number | null>,
  }));

  const boosters: ShopBooster[] = BOOSTERS.map((b) => ({ ...b, finalPrice: b.price }));

  // Envoyé au client pour afficher les cartes tirées sans second aller-retour.
  const catalog: Record<string, CatalogCard> = Object.fromEntries(
    CARDS.map((c) => [
      c.id,
      {
        name: c.name,
        subtitle: c.subtitle,
        rarity: c.rarity,
        glyph: c.glyph,
        description: c.description,
        nature: c.nature,
        power: c.power,
      },
    ]),
  );

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="24 cartes · 6 raretés"
        title="Ouvrir un"
        accent="Booster"
        lead={
          <>
            Les flocons se gagnent en jouant — {ECONOMY.perKill} ❄ par kill,{' '}
            {ECONOMY.perPlacement['1']} ❄ pour un Top&nbsp;1 — et tombent aussi à chaque palier de
            subs, pour tous les joueurs à parts égales. Ils s’échangent ici contre des boosters, ou
            à l’hôtel des ventes contre les cartes des autres.
          </>
        }
      />

      <BoosterOpening
        boosters={boosters}
        balance={balance}
        shopOpen={shopOpen}
        connected={playerId !== null}
        catalog={catalog}
      />

      {/* ---------------------------- Catalogue ------------------------- */}
      <section className="space-y-7 pt-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="section-title text-2xl">
            Le <em>Catalogue</em>
          </h2>
          <p className="max-w-xl text-xs leading-relaxed text-faint">
            Rangé par rareté, parce que c’est tout ce qu’un booster promet : quatre cartes
            par palier, et une puissance qui monte de palier en palier.
          </p>
        </div>

        {[...RARITIES].reverse().map((rarity) => {
          const meta = RARITY_META[rarity];
          const cards = cardsOfRarity(rarity);
          if (cards.length === 0) return null;

          return (
            <div key={rarity}>
              <div
                className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 pl-3"
                style={{ borderColor: meta.color }}
              >
                <h3 className="font-display text-lg font-black tracking-wide uppercase">
                  <span style={{ color: meta.color }}>{meta.label}</span>
                </h3>
                <span className="ml-auto text-[13px] text-muted">
                  <span className="num">{cards.length}</span> carte{cards.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {cards.map((card) => (
                  <CardTile
                    key={card.id}
                    cardId={card.id}
                    name={card.name}
                    subtitle={card.description}
                    rarity={card.rarity}
                    glyph={card.glyph}
                    power={card.power}
                    quote={quotes[card.id]}
                    nature={card.nature}
                    href={`/marche/${card.id}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="glass px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-faint">
          <span className="font-display text-xs font-bold tracking-wider text-muted uppercase">
            Légende
          </span>
          {(['C', 'PC', 'R', 'SR', 'UR', 'L'] as const).map((r) => (
            <span key={r} className="flex items-center gap-1.5">
              <RarityChip rarity={r} />
              {
                { C: 'Commune', PC: 'Peu commune', R: 'Rare', SR: 'Super rare', UR: 'Ultra rare', L: 'Légendaire' }[
                  r
                ]
              }
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="text-danger">⚡</span> Puissance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-ice">❄</span> Cote de marché
          </span>
        </div>
      </section>
    </div>
  );
}
