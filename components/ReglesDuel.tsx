import { IconImpact, IconSnowflake, IconSwords, IconTrophy } from '@/components/icons';
import { flakes } from '@/components/ui';
import { DUEL } from '@/lib/domain/rules';

/**
 * Comment se joue un duel, en quatre étapes, dans l'ordre où elles arrivent :
 * on mise, on court, le hasard tranche, l'autre rafle. Sans rien dire de la
 * course elle-même (03/11/2026) : la découvrir fait partie du duel.
 *
 * La même frise que « Comment ça marche » des boosters : l'icône dans un rond
 * numéroté, un trait jusqu'à l'étape suivante — détaché des ronds —, puis le
 * titre et une précision, alignés en haut.
 */
const ETAPES = [
  {
    Icone: IconSnowflake,
    titre: 'Même mise',
    detail: `${DUEL.mises.slice(0, -1).map(flakes).join(', ')} ou ${flakes(DUEL.miseMax)} ❄ chacun`,
  },
  { Icone: IconSwords, titre: 'La course', detail: 'en direct, sous tes yeux' },
  { Icone: IconImpact, titre: 'Une chance sur deux', detail: 'aucun avantage, le hasard tranche' },
  { Icone: IconTrophy, titre: 'Tout ou rien', detail: 'le gagnant rafle les deux mises' },
];

export function ReglesDuel() {
  return (
    <ol className="duels-frise" aria-label="Comment se joue un duel">
      {ETAPES.map(({ Icone, titre, detail }, i) => (
        <li key={titre} className="duels-frise-etape">
          <div className="duels-frise-rail" aria-hidden="true">
            <span className="frise-rond duels-frise-rond">
              <Icone className="h-[1.2rem] w-[1.2rem]" />
              <span className="frise-numero">{i + 1}</span>
            </span>
            <span className="frise-trait duels-frise-trait" />
          </div>
          <div className="duels-frise-corps">
            <p className="duels-frise-titre">
              <span className="sr-only">Étape {i + 1} : </span>
              {titre}
            </p>
            <p className="duels-frise-texte">{detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
