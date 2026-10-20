import { IconImpact, IconSnowflake, IconSwords, IconTrophy } from '@/components/icons';
import { flakes } from '@/components/ui';
import { DUEL } from '@/lib/domain/rules';

/**
 * Comment se joue un duel, en quatre étapes, dans l'ordre où elles arrivent :
 * on mise, on court, l'un tombe, l'autre rafle. Une icône, un mot en
 * capitales, une précision dessous ; une flèche entre deux étapes dit
 * l'ordre. Elles remplacent quatre colonnes de petit texte, coupées où elles
 * pouvaient.
 */
const ETAPES = [
  {
    Icone: IconSnowflake,
    titre: 'Même mise',
    detail: `de ${flakes(DUEL.miseMin)} à ${flakes(DUEL.miseMax)} ❄ chacun`,
  },
  { Icone: IconSwords, titre: 'La course', detail: 'chacun pousse sa boule de neige' },
  { Icone: IconImpact, titre: 'Une chance sur deux', detail: 'le premier qui tombe a perdu' },
  { Icone: IconTrophy, titre: 'Tout ou rien', detail: 'le gagnant rafle les deux mises' },
];

export function ReglesDuel() {
  return (
    <ol className="duels-etapes" aria-label="Comment se joue un duel">
      {ETAPES.map(({ Icone, titre, detail }) => (
        <li key={titre}>
          <span className="duels-etape-icone" aria-hidden="true">
            <Icone className="h-[1.15rem] w-[1.15rem]" />
          </span>
          <span className="duels-etape-texte">
            <b>{titre}</b>
            <span>{detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
