import type { ReactNode } from 'react';
import { PresentoirBoosters, type BoosterPresente } from '@/components/PresentoirBoosters';
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
 *  - le hero, centré : le nom, une phrase, l'entrée par Twitch ;
 *  - la vitrine des boosters : un onglet par booster, ses cartes en éventail,
 *    à survoler (`PresentoirBoosters`) ;
 *  - « comment ça marche », en quatre étapes : jouer, les subs et les
 *    boosters, les cartes, les flocons ;
 *  - l'appel final.
 *
 * Tout tient dans une même colonne (`.accueil`, 76rem au plus) : les bords
 * s'alignent d'une section à l'autre, même sur un très grand écran.
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
 * Une étape de « comment ça marche » : son numéro, son titre, une phrase, puis
 * les chiffres qui comptent, en lignes — le libellé à gauche, la valeur à
 * droite.
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
  chiffres: { quoi: string; valeur: string }[];
}) {
  return (
    <li className="acc-etape" style={{ ['--teinte' as string]: teinte }}>
      <div className="acc-etape-tete">
        <span className="acc-etape-icone" aria-hidden="true">
          {icone}
        </span>
        <span className="acc-etape-numero" aria-hidden="true">
          {String(numero).padStart(2, '0')}
        </span>
      </div>
      <h3>{titre}</h3>
      <p>{children}</p>
      <dl className="acc-etape-chiffres">
        {chiffres.map((c) => (
          <div key={c.quoi}>
            <dt>{c.quoi}</dt>
            <dd className="num">{c.valeur}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/** Un titre de section, au même gabarit partout. */
function TeteDeSection({ id, sur, titre, children }: { id: string; sur: string; titre: string; children?: ReactNode }) {
  return (
    <header className="acc-tete">
      <p className="eyebrow">{sur}</p>
      <h2 id={id} className="acc-tete-titre">
        {titre}
      </h2>
      {children && <p className="acc-tete-texte">{children}</p>}
    </header>
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

  // Les boosters de la vitrine, avec leurs cartes : celles du catalogue, que
  // le serveur tire vraiment, de la commune à la légendaire.
  const boosters: BoosterPresente[] = PACKS.map((p) => ({
    id: p.id,
    nom: p.name,
    accroche: p.tagline,
    declencheur: p.declencheur,
    gradient: p.gradient,
    art: packArt(p.id),
    gemme: GEMME_DU_PACK[p.id] ?? null,
    cartes: cartesDuPack(p.id)
      .slice()
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.power - b.power)
      .map((c) => ({
        cardId: c.id,
        name: c.name,
        subtitle: c.subtitle,
        description: c.description,
        rarity: c.rarity,
        glyph: c.glyph,
        nature: c.nature,
      })),
  }));

  const commu = SUB_MILESTONES.find((m) => m.packId === 'commu')?.every;
  const folie = SUB_MILESTONES.find((m) => m.packId === 'folie')?.every;

  return (
    <div className="accueil">
      {/* ---- Le hero : le nom, une phrase, l'entrée. Centré. ---- */}
      <section className="acc-hero" aria-labelledby="accueil-titre">
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
          La ligue Warzone de l’hiver, en direct sur Twitch. Joue tes games, grimpe au classement, ouvre des boosters
          et défie les autres joueurs.
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
      </section>

      {/* ---- Les boosters : la vitrine ---- */}
      <section className="acc-section" aria-labelledby="boosters-titre">
        <TeteDeSection id="boosters-titre" sur="Les boosters" titre="Ce que tu peux tirer">
          Choisis un booster : ses cartes en sortent. Survole-les pour lire ce qu’elles font.
        </TeteDeSection>
        <PresentoirBoosters boosters={boosters} />
      </section>

      {/* ---- Comment ça marche, en quatre étapes ---- */}
      <section id="ligue" className="acc-section" aria-labelledby="ligue-titre">
        <TeteDeSection id="ligue-titre" sur="Comment ça marche" titre="La ligue en quatre étapes" />
        <ol className="acc-etapes">
          <Etape
            numero={1}
            teinte="var(--gold)"
            icone={<IconTrophy className="h-5 w-5" />}
            titre="Joue tes games"
            chiffres={[
              { quoi: 'Par kill', valeur: '+1 pt' },
              { quoi: 'Top 1 · 2 · 3', valeur: `+${PLACEMENT_POINTS['1']} · ${PLACEMENT_POINTS['2']} · ${PLACEMENT_POINTS['3']}` },
              { quoi: 'Games dans la saison', valeur: String(DEFAULT_MAX_GAMES_PER_PLAYER) },
              { quoi: 'Qualifiés en finale', valeur: String(SEASON.finalistCount) },
            ]}
          >
            En live sur Twitch. La modération saisit chaque game depuis la capture de fin de partie : tes kills et ton
            top font ton score.
          </Etape>

          <Etape
            numero={2}
            teinte="var(--violet)"
            icone={<IconPack className="h-5 w-5" />}
            titre="Les subs, des boosters"
            chiffres={[
              { quoi: 'Booster Perso', valeur: `T3 ou ${PACKS_REGLES.persoTousLes} offerts` },
              { quoi: 'Booster Commu', valeur: `${commu ?? '?'} subs` },
              { quoi: 'Booster Folie', valeur: `${folie ?? '?'} subs` },
              { quoi: 'Booster Finisseur', valeur: 'dernière game' },
            ]}
          >
            Ouverts à l’antenne par la streameuse. Le Perso est pour qui a payé ; le Commu et le Folie tombent sur des
            joueurs tirés au sort.
          </Etape>

          <Etape
            numero={3}
            teinte="var(--aurora)"
            icone={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="m12 8 1.4 2.6L16 12l-2.6 1.4L12 16l-1.4-2.6L8 12l2.6-1.4z" />
              </svg>
            }
            titre="Une carte, une game"
            chiffres={RARITIES.map((r) => ({ quoi: RARITY_META[r].label, valeur: pourcent(RARITY_WEIGHTS_BASE[r]) }))}
          >
            Chaque booster donne une carte : des points, une game ×2, un Joker… Elle joue sur ta prochaine game, puis
            disparaît. Une à la fois.
          </Etape>

          <Etape
            numero={4}
            teinte="var(--ice)"
            icone={<IconSnowflake className="h-5 w-5" />}
            titre="Les flocons, ta chance"
            chiffres={[
              { quoi: 'Par kill', valeur: `+${ECONOMY.perKill} ❄` },
              { quoi: 'Top 1', valeur: `+${nombre(ECONOMY.perPlacement['1'])} ❄` },
              { quoi: 'Cadeau du jour', valeur: `+${CADEAU_DU_JOUR.parJour} ❄` },
              { quoi: 'Chance aux boosters', valeur: `jusqu’à ×${1 + CHANCE.max}` },
            ]}
          >
            Plus ta réserve est grosse, plus tes boosters sortent des cartes rares. Mise-les en duel : le gagnant rafle
            tout. Ils ne s’achètent pas.
          </Etape>
        </ol>
      </section>

      {/* ---- L'appel final ---- */}
      <section className="acc-fin" aria-label="Rejoindre la ligue">
        <p className="acc-fin-titre">{avantLaSaison ? `Coup d’envoi le ${debut}.` : `En jeu jusqu’au ${fin}.`}</p>
        <p className="acc-fin-texte">Un compte Twitch suffit. Ton pseudo Warzone, et c’est parti.</p>
        {rejoindre}
      </section>
    </div>
  );
}
