/**
 * Formatage déterministe des nombres et des dates.
 *
 * Pourquoi ne pas simplement appeler `toLocaleString('fr-FR')` : parce que le
 * résultat diffère entre le serveur et le navigateur, et que React le
 * considère — à juste titre — comme une incohérence d'hydratation.
 *
 *   — Les milliers : Node sépare avec une espace fine insécable (U+202F),
 *     plusieurs navigateurs avec une espace insécable classique (U+00A0). Deux
 *     chaînes différentes pour le même nombre.
 *   — Les dates : sans fuseau explicite, chaque environnement rend l'heure
 *     dans le sien. Un serveur en UTC et un visiteur à Paris n'affichent pas
 *     la même heure pour la même vente.
 *
 * Ces fonctions produisent donc la même sortie partout, ce qui supprime toute
 * une classe de bugs d'hydratation — et accessoirement fige l'heure des ventes
 * sur le fuseau de la ligue, ce qui est de toute façon ce qu'on veut.
 */

/** Fuseau de référence de la ligue. Toutes les heures affichées y sont ramenées. */
export const LEAGUE_TIMEZONE = 'Europe/Paris';

/** Espace fine insécable, séparateur de milliers du français. */
const THIN = ' ';

/** Entier avec séparateurs de milliers. `12345` → `12 345`. */
export function num(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  const digits = Math.abs(rounded).toString();

  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += THIN;
    out += digits[i];
  }
  return sign + out;
}

/** Décimal à deux chiffres maximum, sans zéros inutiles. `35.4` → `35,4`. */
export function decimal(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return num(rounded);

  const [whole, frac] = Math.abs(rounded).toFixed(2).split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${rounded < 0 ? '−' : ''}${num(Number(whole))},${trimmed}`;
}

/** Format compact pour les vignettes serrées. `12400` → `12 k`. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${decimal(value / 1_000_000)}${THIN}M`;
  if (abs >= 10_000) return `${num(value / 1000)}${THIN}k`;
  if (abs >= 1_000) return `${decimal(value / 1000)}${THIN}k`;
  return num(value);
}

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** Décompose une date dans le fuseau de la ligue, sans dépendre du fuseau local. */
function parts(iso: string) {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: LEAGUE_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const found: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(iso))) {
    if (part.type !== 'literal') found[part.type] = part.value;
  }

  return {
    day: found.day ?? '01',
    month: Number(found.month ?? '1'),
    year: found.year ?? '1970',
    hour: found.hour ?? '00',
    minute: found.minute ?? '00',
  };
}

/** `07/02 14:35` — pour les tableaux serrés. */
export function shortDateTime(iso: string): string {
  const p = parts(iso);
  return `${p.day.padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${p.hour}:${p.minute}`;
}

/** `7 févr. 2027, 14:35` — pour les listes aérées. */
export function longDateTime(iso: string): string {
  const p = parts(iso);
  return `${Number(p.day)} ${MONTHS[p.month - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** `7 févr.` — pour les axes de graphique. */
export function shortDate(iso: string): string {
  const p = parts(iso);
  return `${Number(p.day)} ${MONTHS[p.month - 1]}`;
}
