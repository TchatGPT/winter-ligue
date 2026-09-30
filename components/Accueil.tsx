import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';
import {
  IconBook,
  IconRocket,
  IconShield,
  IconSnowflake,
  IconSwords,
  IconTrophy,
  IconTwitch,
} from '@/components/icons';
import { CARD_IMPACT_CAP, PLACEMENT_POINTS, SEASON } from '@/lib/domain/rules';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni boosters,
 * ni duels. Cette page dit ce qu'est la ligue, ce qu'on y gagne, et comment
 * on y entre — Twitch, puis son pseudo Activision, puis jouer. La saisie des
 * games est faite par la modération à partir des captures de fin de game.
 */
export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  const debut = new Date(SEASON.startsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const fin = new Date(SEASON.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt, et garde l'entrée de l'administration.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';

  const FONCTIONS = [
    {
      icone: IconTrophy,
      titre: 'Le classement',
      texte: `Chaque kill vaut un point. Un Top 1 en rapporte ${PLACEMENT_POINTS['1']}, un Top 2 ${PLACEMENT_POINTS['2']}, un Top 3 ${PLACEMENT_POINTS['3']}. Le classement se met à jour à chaque game saisie.`,
    },
    {
      icone: IconRocket,
      titre: 'Les boosters',
      texte: `Cinq subs offerts d’un coup, ou un sub de niveau 3, et la streameuse ouvre un booster pour toi à l’antenne. La carte tirée se pose sur ta prochaine game : bonus ou malus, jamais plus de ${CARD_IMPACT_CAP} points.`,
    },
    {
      icone: IconSwords,
      titre: 'Les duels',
      texte: 'Tes flocons se misent contre un autre joueur. Une seule manche, une chance sur deux : le gagnant prend le pot.',
    },
    {
      icone: IconSnowflake,
      titre: 'Les flocons',
      texte: 'La monnaie de la saison. Chaque game en rapporte, les duels en font gagner ou perdre. Ils ne s’achètent pas.',
    },
    {
      icone: IconBook,
      titre: 'Les subs de la saison',
      texte: 'Les subs de la chaîne font franchir des paliers qui déclenchent des évènements pour toute la ligue : flocons doublés, cartes renforcées.',
    },
    {
      icone: IconShield,
      titre: 'Rien à saisir toi-même',
      texte: 'La modération lit les captures de fin de game : ton pseudo, tes kills, ton classement. Tu joues, le reste suit.',
    },
  ];

  const ETAPES = [
    { n: '1', titre: 'Connecte-toi avec Twitch', texte: 'Ton pseudo Twitch devient ton nom dans la ligue. Les modérateurs de la chaîne sont reconnus tout seuls.' },
    { n: '2', titre: 'Donne ton pseudo Activision', texte: 'Celui qui apparaît en jeu. C’est lui qu’on reconnaît sur les captures de fin de game.' },
    { n: '3', titre: 'Joue', texte: 'La modération saisit tes games depuis les captures. Tes points et tes flocons tombent tout seuls.' },
    { n: '4', titre: 'Ouvre, mise, grimpe', texte: 'Boosters à l’antenne, duels entre joueurs, et la finale pour les mieux classés.' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      {/* ---- Le hero ---- */}
      <section className="glass glass-reflet relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14 lg:py-16">
        <SnowCap radius="var(--r-lg)" seed="accueil" epaisseur={22} />
        <p className="eyebrow">
          {SEASON.edition} · du {debut} au {fin}
        </p>
        <h1 className="hero-titre mt-3 text-5xl sm:text-6xl lg:text-7xl">Winter Ligue</h1>
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-lg">
          La ligue hivernale Call of Duty Warzone de la chaîne. Chaque kill et chaque Top 3 te donnent
          des points au classement et des flocons. Tes flocons se misent en duel : le gagnant prend
          tout. Les boosters s’ouvrent à l’antenne grâce aux subs, et leur carte joue sur la prochaine
          game.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={entree} className="btn btn-twitch btn-lg no-underline">
            <IconTwitch className="h-5 w-5" />
            Se connecter avec Twitch
          </a>
        </div>
        {!twitchEnabled && (
          <p className="mt-4 text-[13px] text-faint">
            La connexion Twitch ouvre bientôt.
            {devLogin ? ' La connexion de développement reste ouverte en local.' : ''}
          </p>
        )}
      </section>

      {/* ---- Ce qu'on y fait ---- */}
      <section className="space-y-4">
        <TitreGlace taille="bloc" eyebrow="La ligue" align="center">
          Ce qui t’attend
        </TitreGlace>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FONCTIONS.map((f, i) => {
            const Icone = f.icone;
            return (
              <article key={f.titre} className="glass relative overflow-hidden p-5">
                <SnowCap radius="var(--r-lg)" seed={`accueil-${i}`} epaisseur={14} />
                <span className="menu-logo grid h-11 w-11 place-items-center rounded-full">
                  <Icone className="h-5 w-5" />
                </span>
                <h2 className="mt-4 font-display text-xl font-black tracking-wide text-ink uppercase">{f.titre}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.texte}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---- Comment on entre ---- */}
      <section className="glass relative overflow-hidden p-6 sm:p-8">
        <SnowCap radius="var(--r-lg)" seed="accueil-etapes" epaisseur={16} />
        <TitreGlace taille="bloc" eyebrow="En quatre étapes">
          Comment ça marche
        </TitreGlace>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((e) => (
            <li key={e.n} className="glass glass-soft p-4">
              <span className="font-display text-4xl font-black text-ice">{e.n}</span>
              <p className="mt-2 font-display text-[15px] font-bold tracking-wide text-ink uppercase">{e.titre}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{e.texte}</p>
            </li>
          ))}
        </ol>
        <div className="mt-7 flex justify-center">
          <a href={entree} className="btn btn-twitch btn-lg no-underline">
            <IconTwitch className="h-5 w-5" />
            Rejoindre avec Twitch
          </a>
        </div>
      </section>
    </div>
  );
}
