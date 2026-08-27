import Link from 'next/link';
import { RARITY_META, THEMES } from '@/lib/domain/catalog';
import type { Rarity, ThemeId } from '@/lib/domain/types';

/** Raccourci sûr : une rareté inconnue retombe sur la commune plutôt que de casser le rendu. */
export function rarityMeta(rarity: string) {
  return RARITY_META[rarity as Rarity] ?? RARITY_META.C;
}

export function themeMeta(theme: string) {
  return THEMES[theme as ThemeId] ?? null;
}

/** Formatage des flocons. Espace fine insécable pour les milliers. */
export function flakes(n: number): string {
  return n.toLocaleString('fr-FR');
}

/** Formatage compact pour les vignettes serrées : 12 400 → 12,4 k */
export function flakesShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)} k`;
  if (Math.abs(n) >= 1_000) return `${(n / 1000).toFixed(1).replace('.', ',')} k`;
  return String(n);
}

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
    <div className="panel panel-frost px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="eyebrow truncate text-[10px] tracking-[0.18em] text-faint">{label}</div>
      <div className={`num font-display text-xl leading-tight font-black sm:text-2xl ${color}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

/* ------------------------------ Pastilles -------------------------------- */

/** Sigle de rareté : C, PC, R, SR, UR, L. */
export function RarityChip({ rarity, title }: { rarity: string; title?: string }) {
  const meta = rarityMeta(rarity);
  return (
    <span
      className="rarity-chip"
      style={{ ['--chip' as string]: meta.color }}
      title={title ?? meta.label}
    >
      {meta.code}
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

export function ThemeBadge({ theme }: { theme: string }) {
  const meta = themeMeta(theme);
  if (!meta) return null;
  return (
    <span className="badge" style={{ borderColor: `${meta.color}55`, color: meta.color }}>
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.name}
    </span>
  );
}

/* --------------------------- Vignette de carte --------------------------- */

export interface CardTileProps {
  cardId: string;
  name: string;
  subtitle?: string;
  rarity: string;
  theme: string;
  glyph: string;
  /** Indice de puissance sur 100. */
  power?: number;
  /** Cote de marché en flocons. */
  quote?: number | null;
  nature?: 'bonus' | 'malus';
  /** Grisée : non découverte, ou verrouillée par une vente. */
  dimmed?: boolean;
  /** Bandeau bas : prix, boutons, mention du vendeur… */
  footer?: React.ReactNode;
  /** Coin haut droit : compteur d'exemplaires, mention « Nouvelle »… */
  corner?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

/**
 * Vignette de carte à collectionner.
 *
 * La couleur de rareté est injectée en variable CSS `--r` : c'est la feuille de
 * style qui en tire la bordure, le dégradé de la fenêtre d'illustration, le
 * halo au survol et le reflet holographique. Un composant, six apparences.
 */
export function CardTile({
  cardId,
  name,
  subtitle,
  rarity,
  theme,
  glyph,
  power,
  quote,
  nature,
  dimmed,
  footer,
  corner,
  href,
  onClick,
}: CardTileProps) {
  const meta = rarityMeta(rarity);
  const th = themeMeta(theme);

  const body = (
    <article
      className={`tcg h-full ${dimmed ? 'tcg-dim' : ''} ${href || onClick ? '' : 'tcg-hover'}`}
      style={{ ['--r' as string]: meta.color }}
    >
      <div className={`tcg-art ${meta.holo && !dimmed ? 'tcg-holo' : ''}`}>
        <span className="tcg-glyph" aria-hidden="true">
          {glyph}
        </span>

        <span className="absolute top-1.5 left-1.5">
          <RarityChip rarity={rarity} />
        </span>

        {nature === 'malus' && (
          <span
            className="absolute right-1.5 bottom-1.5 rounded px-1 py-px font-display text-[9px] font-black tracking-wider uppercase"
            style={{ background: 'rgba(255,107,107,0.9)', color: '#1c0505' }}
          >
            Malus
          </span>
        )}

        {corner && <span className="absolute top-1.5 right-1.5">{corner}</span>}

        {th && (
          <span
            className="absolute bottom-1.5 left-1.5 text-[11px] leading-none opacity-70"
            title={th.name}
            aria-label={th.name}
          >
            {th.glyph}
          </span>
        )}
      </div>

      <div className="tcg-body">
        <h3 className="tcg-name">{name}</h3>
        {subtitle && <p className="tcg-sub">{subtitle}</p>}

        {(power !== undefined || quote !== undefined) && (
          <div className="tcg-stats">
            {power !== undefined && (
              <span className="text-danger" title={`Puissance ${power} / 100`}>
                ⚡ <span className="num">{power}</span>
              </span>
            )}
            {quote !== undefined && (
              <span className="text-ice" title="Cote : dernier prix constaté">
                ❄ <span className="num">{quote === null ? '—' : flakesShort(quote)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {footer && <div className="tcg-foot">{footer}</div>}
    </article>
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
    <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-3xl opacity-30" aria-hidden="true">
        ❄
      </span>
      <p className="font-display text-sm font-bold tracking-wider text-muted uppercase">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed text-faint">{hint}</p>}
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
    info: 'border-line-2 text-muted bg-bg-2/60',
    error: 'border-danger/50 text-danger bg-danger/5',
    success: 'border-aurora/50 text-aurora bg-aurora/5',
  }[kind];

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${styles}`} role="status">
      {children}
    </div>
  );
}

/** Barre de progression fine, teintée. */
export function Meter({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-bg-1">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, background: color }}
      />
    </div>
  );
}

/** Titre de section avec surtitre. */
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
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title">
          {title} <em>{accent}</em>
        </h1>
        {lead && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
