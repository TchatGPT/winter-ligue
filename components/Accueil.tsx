import { CarrouselTuiles, type TuileRegle } from '@/components/accueil/CarrouselTuiles';
import { type BoosterDeLaScene, SceneDisplay } from '@/components/accueil/SceneDisplay';
import { CalendrierSaisons, type SaisonDuCalendrier } from '@/components/CalendrierSaisons';
import {
  IconCarte,
  IconJauge,
  IconPack,
  IconSnowflake,
  IconSwords,
  IconTrophy,
  IconTwitch,
} from '@/components/icons';
import { PACKS, packArt } from '@/lib/domain/catalog';
import { num } from '@/lib/format';
import {
  CADEAU_DU_JOUR,
  CHANCE,
  DUEL,
  ECONOMY,
  PACKS_REGLES,
  PLACEMENT_POINTS,
  SAISONS,
  SUB_MILESTONES,
  saisonDuMoment,
} from '@/lib/domain/rules';

/**
 * L'accueil, quand on n'est pas connecté (16/11/2026).
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit ce qu'est la ligue, et comment y entrer.
 *
 * Une vidéo rendue dans Blender ouvre la page, à chaque visite : une display
 * de boosters aux couleurs de la ligue se pose, s'ouvre, et les quatre
 * boosters en sortent pour se placer, deux de chaque côté ; la display
 * s'efface (`SceneDisplay`). Restent les boosters et, au milieu, le nom, une
 * phrase, l'entrée par Twitch et le compte à rebours ; en bas, six tuiles de
 * verre disent les règles. Sur un ordinateur, tout tient dans l'écran, sans
 * défiler ; sur un téléphone, tout s'empile.
 *
 * Toutes les valeurs viennent de `lib/domain/rules` et du catalogue : la page
 * ne peut pas dire autre chose que ce que le serveur applique.
 */

/** « du 22 novembre au 4 janvier » → « 22 novembre → 4 janvier ». */
function fleche(periode: string): string {
  const m = /^du (.+?) (?:au|à) (.+)$/.exec(periode);
  return m ? `${m[1]} → ${m[2]}` : periode;
}


export function Accueil({
  twitchEnabled,
  devLogin,
  chaine,
}: {
  twitchEnabled: boolean;
  devLogin: boolean;
  /** La chaîne Twitch de la streameuse (`chaineDeLaLigue`). */
  chaine: string;
}) {
  const saison = saisonDuMoment();
  const nomCourt = (s: (typeof SAISONS)[number]) => s.nom.split(' · ').at(-1) ?? s.nom;

  const saisons: SaisonDuCalendrier[] = SAISONS.map((s) => ({
    numero: s.numero,
    nom: nomCourt(s),
    role: s.numero === 1 ? 'l’échauffement' : 'la vraie saison',
    dates: fleche(s.periode),
    detail:
      s.finalistes > 0 ? `${s.games} games · finale · tout repart de zéro` : `${s.games} games · pas de finale`,
    debut: s.debut,
    fin: s.fin,
  }));

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';

  // Ce qui fait tomber chaque booster, en quelques mots, sous son image.
  const palier = (id: string) => SUB_MILESTONES.find((m) => m.packId === id)?.every ?? 0;
  const QUAND: Record<string, string> = {
    perso: `1 sub T3 ou ${PACKS_REGLES.persoTousLes} subs offerts`,
    commu: `tous les ${palier('commu')} subs`,
    folie: `tous les ${palier('folie')} subs`,
    finisseur: `à ta ${saison.finisseurA}ᵉ game`,
  };
  const boosters: BoosterDeLaScene[] = PACKS.map((p) => ({
    id: p.id,
    court: p.name.replace(/^Booster\s+/, ''),
    quand: QUAND[p.id] ?? p.tagline,
    art: packArt(p.id),
  }));

  const [s1, s2] = saisons;
  const tuiles: TuileRegle[] = [
    {
      cle: 'games',
      theme: 'Le classement',
      icone: <IconTrophy />,
      titre: 'Marque des points',
      texte: (
        <>
          <b>1 pt</b> par kill, <b>+{PLACEMENT_POINTS['1']}</b> le Top 1, <b>+{PLACEMENT_POINTS['2']}</b> le Top 2,{' '}
          <b>+{PLACEMENT_POINTS['3']}</b> le Top 3. Tes {saison.games} games font ton total.
        </>
      ),
    },
    {
      cle: 'boosters',
      theme: 'Les boosters',
      icone: <IconPack />,
      titre: 'Ouvre des boosters',
      texte: (
        <>
          Les subs du live en font tomber, ouverts <b>en direct</b>. Trois Boosters Perso t’attendent à
          l’inscription.
        </>
      ),
    },
    {
      cle: 'cartes',
      theme: 'Les cartes',
      icone: <IconCarte />,
      titre: 'Joue tes cartes',
      texte: (
        <>
          Chaque booster donne <b>une carte</b> : bonus ou malus, elle change une game, puis disparaît.
        </>
      ),
    },
    {
      cle: 'flocons',
      theme: 'Les flocons',
      icone: <IconSnowflake />,
      titre: 'Gagne des flocons',
      texte: (
        <>
          <b>+{ECONOMY.perKill} ❄</b> par kill, <b>+{CADEAU_DU_JOUR.parJour} ❄</b> par jour. Plus ta réserve est
          grosse, plus tu tires rare : jusqu’à <b>×{1 + CHANCE.max}</b>.
        </>
      ),
    },
    {
      cle: 'duels',
      theme: 'Les duels',
      icone: <IconSwords />,
      titre: 'Défie les autres',
      texte: (
        <>
          Mise de <b>{num(DUEL.miseMin)} à {num(DUEL.miseMax)} ❄</b>, une course en direct : le gagnant rafle les
          deux mises.
        </>
      ),
    },
    {
      cle: 'saisons',
      theme: 'Les saisons',
      icone: <IconJauge />,
      titre: 'Deux saisons',
      texte: (
        <>
          <b>{s1?.nom}</b> du {s1?.dates}, puis <b>{s2?.nom}</b> du {s2?.dates} : tout y repart de zéro.
        </>
      ),
    },
  ];

  return (
    <div className="accueil">
      <SceneDisplay boosters={boosters}>
        <section className="acc-centre" aria-labelledby="accueil-titre">
          <p className="acc-surtitre">
            Warzone · en direct sur{' '}
            <a href={`https://www.twitch.tv/${chaine}`} target="_blank" rel="noopener noreferrer">
              twitch.tv/{chaine}
            </a>
          </p>
          <h1 id="accueil-titre" className="hero-titre acc-titre">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="acc-lead">Joue tes games, grimpe au classement, ouvre des boosters, défie les autres.</p>
          <div className="acc-actions">
            <a href={entree} className="btn btn-twitch btn-lg no-underline">
              <IconTwitch className="h-5 w-5" />
              Rejoindre avec Twitch
            </a>
          </div>
          {!twitchEnabled && (
            <p className="acc-note">
              La connexion Twitch ouvre bientôt.
              {devLogin ? ' La connexion de développement reste ouverte en local.' : ''}
            </p>
          )}
          <CalendrierSaisons saisons={saisons} maintenant={Date.now()} compact />
        </section>

        {/* Les règles, en carrousel : une au milieu, ses voisines qui s'effacent dans le fond. */}
        <CarrouselTuiles tuiles={tuiles} label="Comment ça marche" />
      </SceneDisplay>
    </div>
  );
}
