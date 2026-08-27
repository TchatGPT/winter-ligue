import { CardTile } from '@/components/ui';
import { cardsOfTheme, THEMES } from '@/lib/domain/catalog';
import type { ThemeId } from '@/lib/domain/types';

export const metadata = { title: 'Les cartes' };

const ORDER: ThemeId[] = ['glace', 'tempete', 'aurore', 'solstice'];

/**
 * Catalogue public des 16 cartes, famille par famille.
 *
 * Page statique : le catalogue ne dépend d'aucune donnée joueur, elle peut donc
 * être rendue une fois pour toutes.
 */
export default function CartesPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">16 cartes · 4 familles · 4 raretés</p>
        <h1 className="section-title">
          Les <em>Cartes</em>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Chaque carte est un bonus à jouer sur soi, ou un malus à poser sur un adversaire.
          Une carte jouée est consommée — mais sa découverte reste acquise&nbsp;: compléter les
          quatre cartes d’une famille débloque un bonus permanent, que plus rien ne fait perdre.
        </p>
      </header>

      {ORDER.map((themeId) => {
        const theme = THEMES[themeId];
        const cards = cardsOfTheme(themeId);

        return (
          <section key={themeId}>
            <div
              className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 pl-3"
              style={{ borderColor: theme.color }}
            >
              <h2 className="font-display text-xl font-black uppercase tracking-wide">
                <span aria-hidden="true">{theme.glyph}</span>{' '}
                <span style={{ color: theme.color }}>{theme.name}</span>
              </h2>
              <span className="text-xs text-faint">{theme.tagline}</span>
              <span className="ml-auto text-xs text-muted">
                Famille complète&nbsp;:{' '}
                <strong style={{ color: theme.color }}>{theme.setBonusLabel}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((card) => (
                <CardTile
                  key={card.id}
                  cardId={card.id}
                  name={card.name}
                  rarity={card.rarity}
                  theme={card.theme}
                  glyph={card.glyph}
                  description={card.description}
                  nature={card.nature}
                  href={`/marche/${card.id}`}
                  footer={
                    <span className="text-[10px] uppercase tracking-wider text-faint">
                      Voir la cote →
                    </span>
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
