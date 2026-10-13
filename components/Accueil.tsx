import type { ReactNode } from 'react';
import { PresentoirBoosters, type BoosterPresente } from '@/components/PresentoirBoosters';
import { SnowCap } from '@/components/SnowCap';
import { IconPack, IconSnowflake, IconTrophy, IconTwitch } from '@/components/icons';
import { cartesDuPack, GEMME_DU_PACK, PACKS, packArt, RARITY_META } from '@/lib/domain/catalog';
import {
  CADEAU_DU_JOUR,
  CHANCE,
  DEFAULT_MAX_GAMES_PER_PLAYER,
  ECONOMY,
  PACKS_REGLES,
  PLACEMENT_POINTS,
  RARITY_WEIGHTS_BASE,
  SEASON,
  SUB_MILESTONES,
} from '@/lib/domain/rules';
import { RARITIES } from '@/lib/domain/types';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit l'essentiel, et le montre :
 *
 *  - le hero : le nom, une phrase, l'entrée par Twitch, et les quatre boosters
 *    en présentoir — un clic en fait sortir les cartes (`PresentoirBoosters`) ;
 *  - puis « comment ça marche », en quatre étapes : jouer, les subs et les
 *    boosters, les cartes, les flocons.
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

/** Vrai tant que la date n'est pas atteinte. La page est rendue à chaque visite. */
function avantLe(iso: string): boolean {
  return Date.now() < Date.parse(iso);
}

/** « 1er décembre », « 15 mars ». Les bornes de la saison sont à minuit UTC. */
function jourDe(iso: string): string {
  const d = new Date(iso);
  const jour = d.getUTCDate();
  return `${jour === 1 ? '1er' : jour} ${MOIS[d.getUTCMonth()]}`;
}

/** « 1 000 », « 83 % », « 15,5 % ». */
const nombre = (n: number) => n.toLocaleString('fr-FR');
const pourcent = (poids: number) => `${(poids / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

/**
 * Une étape de « comment ça marche » : son numéro, son icône, son titre, une
 * phrase, et les chiffres qui comptent, en pastilles.
 */
function Etape({
  numero,
  teinte,
  icone,
  titre,
  children,
  chiffres,
}: {
  numero: number;
  /** Une couleur du thème : `var(--gold)`… */
  teinte: string;
  icone: ReactNode;
  titre: string;
  children: ReactNode;
  chiffres: { valeur: string; quoi: string }[];
}) {
  return (
    <li className="acc-etape" style={{ ['--teinte' as string]: teinte }}>
      <SnowCap radius="var(--r-lg)" seed={`etape-${numero}`} epaisseur={12} />
      <div className="acc-etape-tete">
        <span className="acc-etape-numero" aria-hidden="true">
          {String(numero).padStart(2, '0')}
        </span>
        <span className="acc-etape-icone" aria-hidden="true">
          {icone}
        </span>
      </div>
      <h3>{titre}</h3>
      <p>{children}</p>
      <ul className="acc-etape-chiffres">
        {chiffres.map((c) => (
          <li key={c.quoi}>
            <b className="num">{c.valeur}</b>
            <span>{c.quoi}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  const debut = jourDe(SEASON.startsAt);
  const fin = jourDe(SEASON.endsAt);
  const avantLaSaison = avantLe(SEASON.startsAt);

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt, et garde l'entrée de l'administration.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';
  const rejoindre = (
    <a href={entree} className="btn btn-twitch btn-lg no-underline">
      <IconTwitch className="h-5 w-5" />
      Rejoindre avec Twitch
    </a>
  );

  // Les boosters du présentoir, avec leurs cartes : celles du catalogue, que
  // le serveur tire vraiment.
  const boosters: BoosterPresente[] = PACKS.map((p) => ({
    id: p.id,
    nom: p.name,
    accroche: p.tagline,
    declencheur: p.declencheur,
    gradient: p.gradient,
    art: packArt(p.id),
    gemme: GEMME_DU_PACK[p.id] ?? null,
    cartes: cartesDuPack(p.id).map((c) => ({
      cardId: c.id,
      name: c.name,
      rarity: c.rarity,
      glyph: c.glyph,
      nature: c.nature,
    })),
  }));

  const commu = SUB_MILESTONES.find((m) => m.packId === 'commu')?.every;
  const folie = SUB_MILESTONES.find((m) => m.packId === 'folie')?.every;

  return (
    <div className="accueil">
      {/* ---- Le hero : le nom, une phrase, l'entrée, et les boosters. ---- */}
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

        <PresentoirBoosters boosters={boosters} />
      </section>

      {/* ---- Comment ça marche, en quatre étapes ---- */}
      <section id="ligue" className="acc-ligue" aria-labelledby="ligue-titre">
        <header className="acc-ligue-tete">
          <p className="eyebrow">Comment ça marche</p>
          <h2 id="ligue-titre" className="titre-glace titre-glace-page">
            <span className="glace" data-text="La ligue en quatre étapes">
              La ligue en quatre étapes
            </span>
          </h2>
        </header>

        <ol className="acc-etapes">
          <Etape
            numero={1}
            teinte="var(--gold)"
            icone={<IconTrophy className="h-6 w-6" />}
            titre="Joue tes games en live"
            chiffres={[
              { valeur: '+1', quoi: 'par kill' },
              { valeur: `+${PLACEMENT_POINTS['1']}`, quoi: 'Top 1' },
              { valeur: `+${PLACEMENT_POINTS['2']}`, quoi: 'Top 2' },
              { valeur: `+${PLACEMENT_POINTS['3']}`, quoi: 'Top 3' },
            ]}
          >
            Tes kills et ton top font ton score. La modération saisit tes games depuis la capture de fin de partie :{' '}
            {DEFAULT_MAX_GAMES_PER_PLAYER} games dans la saison, et les {SEASON.finalistCount} premiers jouent la finale.
          </Etape>

          <Etape
            numero={2}
            teinte="var(--violet)"
            icone={<IconPack className="h-6 w-6" />}
            titre="Les subs font tomber des boosters"
            chiffres={[
              { valeur: 'Perso', quoi: `un sub T3 ou ${PACKS_REGLES.persoTousLes} subs offerts` },
              { valeur: 'Commu', quoi: `tous les ${commu ?? '?'} subs` },
              { valeur: 'Folie', quoi: `tous les ${folie ?? '?'} subs` },
              { valeur: 'Finisseur', quoi: 'ta dernière game' },
            ]}
          >
            Les boosters s’ouvrent à l’antenne, par la streameuse. Le Perso est pour qui a payé ; le Commu et le Folie
            tombent sur des joueurs tirés au sort.
          </Etape>

          <Etape
            numero={3}
            teinte="var(--aurora)"
            icone={
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="m12 8 1.4 2.6L16 12l-2.6 1.4L12 16l-1.4-2.6L8 12l2.6-1.4z" />
              </svg>
            }
            titre="Une carte change une game"
            chiffres={RARITIES.map((r) => ({
              valeur: pourcent(RARITY_WEIGHTS_BASE[r]),
              quoi: RARITY_META[r].label,
            }))}
          >
            Chaque booster donne une carte : des points, une game ×2, un Joker… Elle se joue sur ta prochaine game, puis
            disparaît. Une seule carte par game, et une seule en attente.
          </Etape>

          <Etape
            numero={4}
            teinte="var(--ice)"
            icone={<IconSnowflake className="h-6 w-6" />}
            titre="Tes flocons font ta chance"
            chiffres={[
              { valeur: `+${ECONOMY.perKill}`, quoi: 'flocons par kill' },
              { valeur: `+${nombre(ECONOMY.perPlacement['1'])}`, quoi: 'le Top 1' },
              { valeur: `+${CADEAU_DU_JOUR.parJour}`, quoi: 'chaque jour' },
              { valeur: `×${1 + CHANCE.max}`, quoi: 'de chance, au plus' },
            ]}
          >
            Plus ta réserve est grosse, plus tes boosters sortent des cartes rares. Mise-les en duel : la même mise des
            deux côtés, le gagnant rafle tout. Ils ne s’achètent pas.
          </Etape>
        </ol>

        <div className="acc-ligue-fin">
          {rejoindre}
          <p>{avantLaSaison ? `Coup d’envoi le ${debut}.` : `En jeu jusqu’au ${fin}.`}</p>
        </div>
      </section>
    </div>
  );
}
