import type { CSSProperties, ReactNode } from 'react';
import { CompteARebours } from '@/components/CompteARebours';
import { RailEtapes } from '@/components/RailEtapes';
import { type BoosterEnVitrine, VitrineBoosters } from '@/components/VitrineBoosters';
import { IconJauge, IconPack, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { GEMME_DU_PACK, PACKS, packArt } from '@/lib/domain/catalog';
import {
  CADEAU_DU_JOUR,
  CHANCE,
  ECONOMY,
  PACKS_REGLES,
  PLACEMENT_POINTS,
  SUB_MILESTONES,
  saisonDuMoment,
} from '@/lib/domain/rules';

/**
 * L'accueil, quand on n'est pas connecté.
 *
 * Rien de la ligue n'est visible sans compte : ni classement, ni joueurs, ni
 * duels en cours. La page dit ce qu'est la ligue, et comment y entrer — sur un
 * ordinateur, **en un seul écran, sans défiler** (13/11/2026) :
 *
 *  - à gauche, sur la nuit : la saison et ses dates, le nom, une phrase,
 *    l'entrée par Twitch, et le compte à rebours du coup d'envoi ;
 *  - à droite, la vitrine (`VitrineBoosters`) : les quatre boosters en
 *    lévitation au-dessus d'une banquise, leur reflet dans la glace, et un
 *    cartel par booster — son nom, ce qui le fait tomber ;
 *  - en bas, posés sur la banquise, cinq blocs de glace : la ligue en cinq
 *    étapes, dans l'ordre où on la vit. Un verbe, une phrase, les chiffres en
 *    gras. Si la fenêtre est trop étroite pour les cinq, c'est le rail qui
 *    défile, de gauche à droite (`RailEtapes`), jamais la page.
 *
 * Sur un téléphone ou une tablette debout, tout s'empile et la page défile :
 * la vitrine, le nom et l'entrée, puis les étapes, et l'entrée à nouveau.
 *
 * Toutes les valeurs viennent de `lib/domain/rules` et du catalogue : la page
 * ne peut pas dire autre chose que ce que le serveur applique.
 */

/** « 22 novembre », « 1er mars » : un jour de la saison, à l'heure de Paris. */
function jourDe(iso: string): string {
  const [jour, mois] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' })
    .format(new Date(iso))
    .split(' ');
  return `${jour === '1' ? '1er' : jour} ${mois}`;
}

/**
 * Une étape de la ligue : un bloc de glace, en relief — sa face, son dessus,
 * son côté. Le numéro et le thème en haut, l'icône gravée dans une bille, un
 * verbe en titre, puis la phrase, ses chiffres en gras. La lumière prise dans
 * la glace est à la couleur de l'étape (`teinte`).
 */
function Etape({
  numero,
  teinte,
  theme,
  icone,
  titre,
  children,
}: {
  numero: number;
  /** Une couleur du thème : `var(--gold)`… */
  teinte: string;
  theme: string;
  icone: ReactNode;
  titre: string;
  children: ReactNode;
}) {
  return (
    <li
      className="acc-etape"
      style={{ ['--teinte' as string]: teinte, ['--rang' as string]: numero - 1 } as CSSProperties}
    >
      <header className="acc-etape-tete">
        <span className="acc-etape-num" aria-hidden="true">
          {String(numero).padStart(2, '0')}
        </span>
        <span className="acc-etape-theme">{theme}</span>
        <span className="acc-etape-icone" aria-hidden="true">
          {icone}
        </span>
      </header>
      <h3>{titre}</h3>
      <p>{children}</p>
    </li>
  );
}

export function Accueil({ twitchEnabled, devLogin }: { twitchEnabled: boolean; devLogin: boolean }) {
  // La saison du calendrier : la Mini Ligue jusqu'au 4 janvier, puis la saison 2.
  const saison = saisonDuMoment();
  const [nomSaison, surnom] = saison.nom.split(' · ');

  // Twitch branché, on part chez lui ; sinon la page de connexion dit que la
  // connexion ouvre bientôt.
  const entree = twitchEnabled ? '/api/auth/twitch?returnTo=/' : '/connexion';
  const rejoindre = (
    <a href={entree} className="btn btn-twitch btn-lg no-underline">
      <IconTwitch className="h-5 w-5" />
      Rejoindre avec Twitch
    </a>
  );

  // Ce qui fait tomber chaque booster, en quelques mots, sur son cartel.
  const palier = (id: string) => SUB_MILESTONES.find((m) => m.packId === id)?.every;
  const quand: Record<string, string> = {
    perso: `un T3 ou ${PACKS_REGLES.persoTousLes} subs offerts`,
    commu: `tous les ${palier('commu')} subs`,
    folie: `tous les ${palier('folie')} subs`,
    finisseur: `à ta ${saison.finisseurA}ᵉ game`,
  };
  const boosters: BoosterEnVitrine[] = PACKS.map((p) => ({
    id: p.id,
    nom: p.name,
    court: p.name.replace(/^Booster\s+/, ''),
    quand: quand[p.id] ?? p.tagline,
    gradient: p.gradient,
    art: packArt(p.id),
    rarete: GEMME_DU_PACK[p.id],
  }));

  return (
    <div className="accueil">
      {/* ---- La nuit à gauche, la vitrine à droite ---- */}
      <section className="acc-scene" aria-labelledby="accueil-titre">
        <div className="acc-texte">
          <p className="acc-saison">
            <b>
              {nomSaison}
              {surnom ? ` · ${surnom}` : ''}
            </b>
            <span>{saison.periode}</span>
          </p>
          <h1 id="accueil-titre" className="hero-titre acc-titre">
            <span className="glace" data-text="Winter">
              Winter
            </span>{' '}
            <em className="glace" data-text="Ligue">
              Ligue
            </em>
          </h1>
          <p className="acc-lead">
            La ligue Warzone de l’hiver, en direct sur Twitch.{' '}
            <span className="acc-lead-suite">
              Joue tes games, grimpe au classement, ouvre des boosters et défie les autres joueurs.
            </span>
          </p>
          <div className="acc-actions">
            {rejoindre}
            <CompteARebours jusqua={saison.debut} maintenant={Date.now()} jour={jourDe(saison.debut)} />
          </div>
          <p className="acc-note">
            {twitchEnabled
              ? 'Ton compte Twitch suffit : pas de mot de passe.'
              : `La connexion Twitch ouvre bientôt.${devLogin ? ' La connexion de développement reste ouverte en local.' : ''}`}
          </p>
        </div>

        <VitrineBoosters boosters={boosters} />
      </section>

      {/* ---- La ligue en cinq étapes, en blocs de glace ---- */}
      <section className="acc-etapes" aria-labelledby="etapes-titre">
        <RailEtapes
          titre={
            <>
              <h2 id="etapes-titre">
                <span className="acc-etapes-sur">Comment ça marche</span>
                <span className="acc-etapes-grand">La ligue en cinq étapes</span>
              </h2>
              <span className="acc-etapes-trait" aria-hidden="true" />
            </>
          }
        >
          <Etape
            numero={1}
            teinte="var(--gold)"
            theme="Le classement"
            icone={<IconTrophy />}
            titre="Marque des points"
          >
            <b>1 point</b> par kill, <b>+{PLACEMENT_POINTS['1']}</b> le Top 1, <b>+{PLACEMENT_POINTS['2']}</b> le
            Top 2, <b>+{PLACEMENT_POINTS['3']}</b> le Top 3. Tes {saison.games} games font ton total.
          </Etape>
          <Etape
            numero={2}
            teinte="var(--ice)"
            theme="Les flocons"
            icone={<IconSnowflake />}
            titre="Gagne des flocons"
          >
            <b>+{ECONOMY.perKill} ❄</b> par kill, <b>+{ECONOMY.perPlacement['1']} ❄</b> le Top 1,{' '}
            <b>+{CADEAU_DU_JOUR.parJour} ❄</b> chaque jour. Ils ne s’achètent pas : ils se gagnent.
          </Etape>
          <Etape
            numero={3}
            teinte="var(--violet)"
            theme="Les boosters"
            icone={<IconPack />}
            titre="Ouvre des boosters"
          >
            Les subs du live en font tomber, ouverts <b>en direct</b>. Chacun donne <b>une carte</b> qui change une
            game : bonus ou malus.
          </Etape>
          <Etape
            numero={4}
            teinte="var(--aurora)"
            theme="La chance"
            icone={<IconJauge />}
            titre="Vise les cartes rares"
          >
            Garde tes flocons : plus ta réserve est grosse, plus tu tires rare. Jusqu’à{' '}
            <b>×{1 + CHANCE.max} de chance</b>.
          </Etape>
          <Etape
            numero={5}
            teinte="color-mix(in srgb, var(--live) 55%, var(--violet))"
            theme="Les duels"
            icone={<IconSwords />}
            titre="Défie les autres"
          >
            Mise tes flocons contre un joueur : même mise, <b>une chance sur deux</b>, et le gagnant rafle tout.
          </Etape>
        </RailEtapes>
        <div className="acc-fin">{rejoindre}</div>
      </section>
    </div>
  );
}
