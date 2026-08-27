import { BoosterOpening, type CatalogCard, type ShopBooster } from '@/components/BoosterOpening';
import { CardTile, PageHead, RarityChip } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { BOOSTERS, CARDS, cardsOfTheme, THEMES } from '@/lib/domain/catalog';
import { discountedPrice } from '@/lib/domain/economy';
import { ECONOMY } from '@/lib/domain/rules';
import type { ThemeId } from '@/lib/domain/types';
import { bonusesFor } from '@/lib/services/league';
import { statsForCard } from '@/lib/services/market';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boosters' };

const ORDER: ThemeId[] = ['glace', 'tempete', 'aurore', 'solstice'];

/**
 * Boosters : achat, ouverture en 3D, et catalogue complet des 24 cartes.
 *
 * Le prix affiché est déjà celui que le serveur appliquera — la remise de
 * collection est calculée ici à partir des familles réellement complétées. Le
 * composant client n'a donc aucun calcul de prix à faire, et aucun moyen d'en
 * imposer un.
 */
export default async function BoostersPage() {
  const session = await getSession();
  const playerId = session?.role === 'joueur' ? session.sub : null;

  const { balance, discount, shopOpen, quotes } = await getStore().read((db) => ({
    balance: playerId ? (db.players.find((p) => p.id === playerId)?.snowflakes ?? null) : null,
    discount: playerId ? bonusesFor(db, playerId).shopDiscount : 0,
    shopOpen: db.config.shopOpen,
    // Cote de chaque carte, pour que le catalogue affiche une valeur de marché.
    quotes: Object.fromEntries(
      CARDS.map((c) => [c.id, statsForCard(db, c.id).lastPrice]),
    ) as Record<string, number | null>,
  }));

  const boosters: ShopBooster[] = BOOSTERS.map((b) => ({
    ...b,
    finalPrice: discountedPrice(b.price, discount),
  }));

  // Envoyé au client pour afficher les cartes tirées sans second aller-retour.
  const catalog: Record<string, CatalogCard> = Object.fromEntries(
    CARDS.map((c) => [
      c.id,
      {
        name: c.name,
        subtitle: c.subtitle,
        rarity: c.rarity,
        theme: c.theme,
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
        eyebrow="24 cartes · 4 familles · 6 raretés"
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
            Chaque famille suit la même montée en puissance : une carte se compare toujours à ses
            homologues de rareté. Compléter 4 cartes sur 6 débloque un bonus permanent, les 6 le
            doublent.
          </p>
        </div>

        {ORDER.map((themeId) => {
          const theme = THEMES[themeId];
          const cards = cardsOfTheme(themeId);

          return (
            <div key={themeId}>
              <div
                className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 pl-3"
                style={{ borderColor: theme.color }}
              >
                <h3 className="font-display text-lg font-black tracking-wide uppercase">
                  <span aria-hidden="true">{theme.glyph}</span>{' '}
                  <span style={{ color: theme.color }}>{theme.name}</span>
                </h3>
                <span className="text-xs text-faint">{theme.tagline}</span>
                <span className="ml-auto text-[11px] text-muted">
                  4/6 → <strong className="text-ink">{theme.partialBonusLabel}</strong>
                  <span className="mx-1.5 text-faint">·</span>
                  6/6 → <strong style={{ color: theme.color }}>{theme.fullBonusLabel}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {cards.map((card) => (
                  <CardTile
                    key={card.id}
                    cardId={card.id}
                    name={card.name}
                    subtitle={card.description}
                    rarity={card.rarity}
                    theme={card.theme}
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

      <section className="panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-faint">
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
