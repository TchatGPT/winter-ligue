import Link from 'next/link';
import { CardFrame } from '@/components/CardFrame';
import { RarityIcon } from '@/components/RarityIcon';
import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';
import { compact, num } from '@/lib/format';

/** Une rareté inconnue retombe sur la commune plutôt que de casser le rendu. */
export function rarityMeta(rarity: string) {
  return RARITY_META[rarity as Rarity] ?? RARITY_META.C;
}

/**
 * Alias historiques vers les formateurs déterministes de `lib/format`.
 * Le formatage passe par là et jamais par `toLocaleString` : Node et les
 * navigateurs ne produisent pas la même chaîne, ce qui casse l'hydratation.
 */
export const flakes = num;
export const flakesShort = compact;

/* ------------------------------- Tuiles --------------------------------- */

export function StatTile({
  label,
  value,
  hint,
  accent = 'ice',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'ice' | 'gold' | 'aurora' | 'violet' | 'ink' | 'danger';
}) {
  const color = {
    ice: 'text-ice',
    gold: 'text-gold',
    aurora: 'text-aurora',
    violet: 'text-violet',
    ink: 'text-ink',
    danger: 'text-danger',
  }[accent];

  return (
    <div className="glass flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">
      {/* Le libellé passe à la ligne au lieu d'être tronqué : sur une grille à
          deux colonnes de téléphone, « Ventes en cours » ne tient pas, et
          « Ventes en cou… » ne veut plus rien dire. */}
      <div className="text-[12.5px] leading-tight font-semibold tracking-[0.1em] text-faint uppercase">
        {label}
      </div>
      <div
        className={`num mt-1.5 font-display text-[26px] leading-none font-black sm:text-[32px] ${color}`}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[13px] leading-snug text-muted">{hint}</div>}
    </div>
  );
}

/* ------------------------------ Pastilles -------------------------------- */

/**
 * La pastille de rareté.
 *
 * Elle portait le sigle — `C`, `PC`, `SR` — et porte désormais une marque
 * dessinée. Un sigle se décode, une forme se reconnaît : dans une grille de
 * vignettes, on veut classer sans lire.
 *
 * Le nom accessible est repris sur la pastille elle-même. Le sigle en tenait
 * lieu jusqu'ici sans qu'on ait à y penser ; un dessin, non.
 */
export function RarityChip({ rarity, title }: { rarity: string; title?: string }) {
  const meta = rarityMeta(rarity);
  return (
    <span
      className="rarity-chip"
      style={{ ['--chip' as string]: meta.color }}
      title={title ?? meta.label}
      role="img"
      aria-label={title ?? meta.label}
    >
      <RarityIcon rarity={rarity} />
    </span>
  );
}

export function RarityBadge({ rarity }: { rarity: string }) {
  const meta = rarityMeta(rarity);
  return (
    <span className="badge" style={{ borderColor: `${meta.color}66`, color: meta.color }}>
      {meta.label}
    </span>
  );
}

/* --------------------------- Vignette de carte --------------------------- */

export interface CardTileProps {
  cardId: string;
  name: string;
  subtitle?: string;
  /** Le texte d'effet. Absent, la vignette retombe sur le sous-titre. */
  description?: string;
  rarity: string;
  glyph: string;
  power?: number;
  quote?: number | null;
  nature?: 'bonus' | 'malus';
  /** Exemplaires détenus : au-delà de 1, la carte porte un compteur. */
  copies?: number;
  dimmed?: boolean;
  footer?: React.ReactNode;
  corner?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

/**
 * Vignette de carte à collectionner.
 *
 * La couleur de rareté est injectée en variable CSS `--r` : la feuille de style
 * en tire la bordure, la pastille, le halo au survol et surtout le **bandeau**.
 * Un composant, six apparences.
 *
 * ## Le bandeau est plein, et son texte est sombre
 *
 * C'est l'inverse du reste du site, qui est en verre sombre à texte clair, et
 * c'est délibéré. Une grille de cartes se lit d'abord par blocs de couleur : si
 * le bandeau reste dans les gris translucides et que la rareté n'est signalée
 * que par un liseré, il faut lire chaque vignette pour trier. Un aplat teinté
 * par la rareté se trie d'un coup d'œil, à un mètre de l'écran.
 *
 * Les six teintes de rareté sont claires — c'est une palette de nuit polaire,
 * pensée pour ressortir sur du noir. Sur un aplat, elles imposent donc du texte
 * sombre : du blanc dessus passerait sous le seuil de contraste sur quatre des
 * six raretés.
 */
export function CardTile({
  cardId,
  name,
  subtitle,
  description,
  rarity,
  glyph,
  power,
  quote,
  nature,
  copies,
  dimmed,
  footer,
  corner,
  href,
  onClick,
}: CardTileProps) {
  const body = (
    <div className="flex h-full flex-col gap-2">
      <div className={href || onClick ? '' : 'cadre-survol'}>
        <CardFrame
          cardId={cardId}
          name={name}
          description={description ?? subtitle}
          rarity={rarity}
          glyph={glyph}
          power={power}
          quote={quote}
          nature={nature}
          copies={copies}
          dimmed={dimmed}
          corner={corner}
        />
      </div>

      {footer && <div className="tcg-foot rounded-lg">{footer}</div>}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="tcg-link block w-full text-left">
        {body}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className="tcg-link block no-underline" aria-label={name} key={cardId}>
        {body}
      </Link>
    );
  }

  return body;
}

/* -------------------------------- Divers --------------------------------- */

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="text-4xl opacity-40" aria-hidden="true">
        ❄
      </span>
      <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">{title}</p>
      {hint && <p className="max-w-md text-[15px] leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-white/15 text-ink-2',
    error: 'border-danger/45 text-danger',
    success: 'border-aurora/45 text-aurora',
  }[kind];

  return (
    <div
      className={`glass glass-soft rounded-2xl border px-4 py-3 text-[15px] leading-relaxed ${styles}`}
      role="status"
    >
      {children}
    </div>
  );
}

/** Jauge fine et teintée. */
export function Meter({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{
          width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: `0 0 12px ${color}80`,
        }}
      />
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  accent,
  lead,
  actions,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title mt-1">
          {title} <em>{accent}</em>
        </h1>
        {lead && (
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-2 sm:text-base">
            {lead}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/**
 * Ligne d'un tableau converti en carte, pour les petits écrans.
 *
 * Un tableau de dix colonnes ne se lit pas au pouce, et le faire défiler
 * horizontalement n'est pas une réponse : sous 768 px, chaque ligne devient une
 * carte où les valeurs sont empilées avec leur intitulé.
 */
export function DataRow({
  lead,
  trail,
  fields,
  highlight,
}: {
  lead: React.ReactNode;
  trail?: React.ReactNode;
  fields: { label: string; value: React.ReactNode }[];
  highlight?: boolean;
}) {
  return (
    <div
      className="glass glass-soft px-4 py-3.5"
      style={highlight ? { borderColor: 'rgba(255,217,125,0.45)' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{lead}</div>
        {trail && <div className="shrink-0 text-right">{trail}</div>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-white/10 pt-3 min-[400px]:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="truncate text-[13px] font-semibold tracking-[0.12em] text-faint uppercase">
              {field.label}
            </dt>
            <dd className="num truncate font-display text-[15px] font-bold text-ink">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
