import Link from 'next/link';
import { RARITY_META, THEMES } from '@/lib/domain/catalog';
import type { Rarity, ThemeId } from '@/lib/domain/types';

/** Tuile de statistique : un grand chiffre, un libellé discret. */
export function StatTile({
  label,
  value,
  hint,
  accent = 'ice',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'ice' | 'gold' | 'aurora' | 'violet' | 'muted';
}) {
  const color = {
    ice: 'text-ice',
    gold: 'text-gold',
    aurora: 'text-aurora',
    violet: 'text-violet',
    muted: 'text-ink',
  }[accent];

  return (
    <div className="panel panel-frost px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div className={`num font-display text-2xl font-black leading-tight ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

/** Pastille de rareté, couleur incluse. */
export function RarityBadge({ rarity }: { rarity: Rarity | string }) {
  const meta = RARITY_META[rarity as Rarity] ?? RARITY_META.COMMUNE;
  return (
    <span
      className="badge"
      style={{ borderColor: `${meta.color}66`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

/** Pastille de famille. */
export function ThemeBadge({ theme }: { theme: ThemeId | string }) {
  const meta = THEMES[theme as ThemeId];
  if (!meta) return null;
  return (
    <span className="badge" style={{ borderColor: `${meta.color}55`, color: meta.color }}>
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.name}
    </span>
  );
}

export interface CardTileProps {
  cardId: string;
  name: string;
  rarity: string;
  theme: string;
  glyph: string;
  description?: string;
  nature?: 'bonus' | 'malus';
  /** Grisée : non découverte, ou verrouillée par une vente. */
  dimmed?: boolean;
  footer?: React.ReactNode;
  href?: string;
}

/**
 * Carte à jouer. La couleur de rareté est injectée en variable CSS `--rarity`,
 * ce qui laisse la feuille de style gérer bordure, dégradé et lueur au survol.
 */
export function CardTile({
  cardId,
  name,
  rarity,
  theme,
  glyph,
  description,
  nature,
  dimmed,
  footer,
  href,
}: CardTileProps) {
  const meta = RARITY_META[rarity as Rarity] ?? RARITY_META.COMMUNE;
  const themeMeta = THEMES[theme as ThemeId];

  const body = (
    <div
      className={`game-card h-full ${dimmed ? 'game-card--locked' : ''}`}
      style={{ ['--rarity' as string]: meta.color }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="game-card__glyph" aria-hidden="true">
          {glyph}
        </span>
        {nature === 'malus' && (
          <span className="badge border-danger/50 text-danger">Malus</span>
        )}
      </div>

      <h3 className="mt-2 font-display text-sm font-bold uppercase leading-tight tracking-wide text-ink">
        {name}
      </h3>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          className="font-display text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
        {themeMeta && (
          <span className="text-[10px] text-faint">· {themeMeta.name}</span>
        )}
      </div>

      {description && (
        <p className="mt-2 flex-1 text-xs leading-snug text-muted">{description}</p>
      )}

      {footer && <div className="mt-3 border-t border-line pt-2.5">{footer}</div>}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="no-underline" aria-label={`Cote de ${name}`} key={cardId}>
      {body}
    </Link>
  );
}

/** Bloc « rien à afficher », pour éviter les pages vides sans explication. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="panel flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <span className="text-2xl opacity-40" aria-hidden="true">
        ❄
      </span>
      <p className="font-display text-sm font-bold uppercase tracking-wider text-muted">{title}</p>
      {hint && <p className="max-w-md text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** Message d'erreur ou de succès inline. */
export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-line-bright text-muted',
    error: 'border-danger/50 text-danger',
    success: 'border-aurora/50 text-aurora',
  }[kind];

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${styles}`} role="status">
      {children}
    </div>
  );
}

/** Formatage court des flocons. */
export function formatFlakes(n: number): string {
  return n.toLocaleString('fr-FR');
}
