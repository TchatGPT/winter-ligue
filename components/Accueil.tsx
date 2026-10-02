import type { CSSProperties, ReactNode } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { Diaporama, type Diapositive } from '@/components/Diaporama';
import { EventailBoosters } from '@/components/EventailBoosters';
import { SnowCap } from '@/components/SnowCap';
import { IconJauge, IconPack, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import { CADEAU_DU_JOUR, CARD_IMPACT_CAP, CHANCE, DUEL, ECONOMY, PLACEMENT_POINTS, SEASON } from '@/lib/domain/rules';
import { num } from '@/lib/format';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit l'essentiel, et le montre :
 *
 *  - le hero, à même le ciel des boosters : le nom, une phrase, l'entrée par
 *    Twitch, et les quatre boosters distribués en éventail à l'arrivée, qui
 *    suivent la souris ;
 *  - puis la ligue en quatre cartes à collectionner (`Diaporama`), qu'on tire
 *    du doigt ou à la souris : le classement, les flocons et la chance, les
 *    boosters, les duels. Chacune porte une planche peinte des boosters en
 *    pleine page, et son titre sur un bandeau de verre givré.
 *
 * Le détail est dans les règles, une fois connecté. Toutes les valeurs
 * viennent de `lib/domain/rules` et du catalogue : la page ne peut pas dire
 * autre chose que ce que le serveur applique.
 */

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 1er décembre », « 15 mars ». Les bornes de la saison sont à minuit UTC. */
function jourDe(iso: string): string {
  const d = new Date(iso);
  const jour = d.getUTCDate();
  return `${jour === 1 ? '1er' : jour} ${MOIS[d.getUTCMonth()]}`;
}

/**
 * Une carte de la ligue, comme une carte à collectionner : la planche peinte
 * en pleine page, un filet de cadre, le numéro et le thème en haut, son
 * médaillon, et en bas, sur un bandeau de verre givré, le titre, la phrase et
 * les nombres qui comptent.
 */
function Carte({
  numero,
  total,
  art,
  eyebrow,
  icone,
  titre,
  chiffres,
  children,
}: {
  numero: number;
  total: number;
  /** La planche peinte : l'adresse d'une image de `public/`. */
  art: string | null;
  eyebrow: string;
  icone: ReactNode;
  titre: string;
  /** Deux ou trois nombres, en pastilles. */
  chiffres: string[];
  children: ReactNode;
}) {
  const deux = (x: number) => String(x).padStart(2, '0');
  return (
    <article className="carte-ligue">
      <span
        className="carte-ligue-art"
        aria-hidden="true"
        style={art ? ({ ['--art' as string]: `url("${art}")` } as CSSProperties) : undefined}
      />
      <span className="carte-ligue-cadre" aria-hidden="true" />
      <SnowCap radius="30px" seed={`carte-ligue-${numero}`} epaisseur={14} />
      <header className="carte-ligue-tete">
        <p className="carte-ligue-num">
          {deux(numero)}
          <small>/{deux(total)}</small>
          <span>{eyebrow}</span>
        </p>
        <span className="carte-ligue-icone" aria-hidden="true">
          {icone}
        </span>
      </header>
      <div className="carte-ligue-bande">
        <h3>{titre}</h3>
        <p>{children}</p>
        <ul className="carte-ligue-chiffres">
          {chiffres.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  const debut = jourDe(SEASON.startsAt);
  const fin = jourDe(SEASON.endsAt);
  const avantLaSaison = Date.now() < Date.parse(SEASON.startsAt);

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt, et garde l'entrée de l'administration.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';
  const rejoindre = (
    <a href={entree} className="btn btn-twitch btn-lg no-underline">
      <IconTwitch className="h-5 w-5" />
      Rejoindre avec Twitch
    </a>
  );

  const CARTES: { cle: string; titre: string; carte: Omit<Parameters<typeof Carte>[0], 'numero' | 'total'> }[] = [
    {
      cle: 'classement',
      titre: 'Le classement',
      carte: {
        art: packArt('finisseur'),
        eyebrow: 'Le classement',
        icone: <IconTrophy className="h-5 w-5" />,
        titre: 'Chaque kill compte',
        chiffres: ['+1 par kill', `+${PLACEMENT_POINTS['1']} le Top 1`, `${SEASON.finalistCount} en finale`],
        children: 'Tes kills et tes Top 3 te font grimper. En fin de saison, les meilleurs jouent la finale.',
      },
    },
    {
      cle: 'flocons',
      titre: 'Les flocons',
      carte: {
        art: packArt('commu'),
        eyebrow: 'Les flocons',
        icone: <IconJauge className="h-5 w-5" />,
        titre: 'Garde tes flocons, tire plus haut',
        chiffres: [
          `+${ECONOMY.perKill} ❄ par kill`,
          `+${CADEAU_DU_JOUR.parJour} ❄ par jour`,
          `×${1 + CHANCE.max} de chance`,
        ],
        children: 'Chaque game en rapporte. Plus ta réserve est grosse, plus tes boosters sortent des cartes rares.',
      },
    },
    {
      cle: 'boosters',
      titre: 'Les boosters',
      carte: {
        art: packArt('folie'),
        eyebrow: 'Les boosters',
        icone: <IconPack className="h-5 w-5" />,
        titre: 'Les subs font tomber des boosters',
        chiffres: [`${PACKS.length} boosters`, 'ouverts en live', `jusqu’à ${CARD_IMPACT_CAP} pts`],
        children: 'Chacun donne une carte qui change une game, en bonus ou en malus.',
      },
    },
    {
      cle: 'duels',
      titre: 'Les duels',
      carte: {
        art: packArt('perso'),
        eyebrow: 'Les duels',
        icone: <IconSwords className="h-5 w-5" />,
        titre: 'Mise tes flocons en duel',
        chiffres: ['même mise', '1 chance sur 2', `jusqu’à ${num(DUEL.miseMax)} ❄`],
        children: 'Un joueur contre un autre : le gagnant rafle les deux mises.',
      },
    },
  ];

  const DIAPOS: Diapositive[] = CARTES.map(({ cle, titre, carte }, i) => ({
    cle,
    titre,
    contenu: <Carte numero={i + 1} total={CARTES.length} {...carte} />,
  }));

  return (
    <div className="accueil">
      {/* ---- Le hero, à même le ciel : le nom, une phrase, l'entrée, et les
              quatre boosters distribués en éventail dans leur fumée. ---- */}
      <section className="acc-hero" aria-labelledby="accueil-titre">
        <div className="acc-hero-texte">
          <p className="eyebrow">
            {SEASON.edition} · du {debut} au {fin}
          </p>
          <h1 id="accueil-titre" className="hero-titre acc-titre">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="acc-hero-lead">
            La ligue Warzone de l’hiver, en direct sur Twitch. Joue, grimpe au classement, ouvre des boosters et défie
            les autres joueurs.
          </p>
          <div className="acc-hero-actions">
            {rejoindre}
            <a href="#ligue" className="btn btn-lg no-underline">
              Comment ça marche
            </a>
          </div>
          {!twitchEnabled && (
            <p className="acc-hero-note">
              La connexion Twitch ouvre bientôt.
              {devLogin ? ' La connexion de développement reste ouverte en local.' : ''}
            </p>
          )}
        </div>

        <EventailBoosters>
          <div className="acc-eventail-cadre">
            <div className="acc-eventail-fumee fumee" data-pack="finisseur" data-niveau="4">
              <span className="fumee-nappe fumee-nappe-1" />
              <span className="fumee-nappe fumee-nappe-2" />
              <span className="fumee-nappe fumee-nappe-3" />
            </div>
          </div>
          {PACKS.map((p, i) => (
            <div
              key={p.id}
              className="acc-eventail-sachet"
              // La place dans l'arc (-1,5 à gauche, +1,5 à droite) et le rang
              // de distribution, du premier au dernier.
              style={
                {
                  ['--o' as string]: i - 1.5,
                  ['--o-abs' as string]: Math.abs(i - 1.5),
                  ['--rang' as string]: i,
                } as CSSProperties
              }
            >
              <div className="acc-eventail-parallaxe">
                <BoosterPack3D
                  name={p.name}
                  cardCount={1}
                  gradient={p.gradient}
                  art={packArt(p.id)}
                  rarete={GEMME_DU_PACK[p.id]}
                  vignette
                />
              </div>
            </div>
          ))}
        </EventailBoosters>
      </section>

      {/* ---- La ligue, en quatre cartes à collectionner ---- */}
      <section id="ligue" className="acc-ligue" aria-labelledby="ligue-titre">
        <header className="acc-ligue-tete">
          <p className="eyebrow">Comment ça marche</p>
          <h2 id="ligue-titre" className="titre-glace titre-glace-page">
            <span className="glace" data-text="La ligue en quatre cartes">
              La ligue en quatre cartes
            </span>
          </h2>
          <p className="acc-ligue-indice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 9 5 12l3 3M16 9l3 3-3 3M5 12h14" />
            </svg>
            Fais glisser les cartes
          </p>
        </header>
        <Diaporama label="La ligue en quatre cartes" diapositives={DIAPOS} />
        <div className="acc-ligue-fin">
          {rejoindre}
          <p>{avantLaSaison ? `Coup d’envoi le ${debut}.` : `En jeu jusqu’au ${fin}.`}</p>
        </div>
      </section>
    </div>
  );
}
