import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import { FondHiver } from '@/components/FondHiver';
import { Sidebar, SIDEBAR_WIDTH } from '@/components/Sidebar';
import { getSession } from '@/lib/auth/session';
import './globals.css';
import { PiedDePage } from '@/components/PiedDePage';
import { EvenementsFlottants } from '@/components/EvenementsFlottants';
import { getStore } from '@/lib/db/store';
import { evenementsActifs } from '@/lib/services/evenements';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Winter Ligue — Call of Duty Warzone',
    template: '%s · Winter Ligue',
  },
  description:
    'La ligue hivernale Warzone : classement, boosters, cartes bonus et malus, et duels en flocons.',
  applicationName: 'Winter Ligue',
  openGraph: {
    title: 'Winter Ligue — Call of Duty Warzone',
    description: 'Classement, boosters, cartes et duels. Saison hivernale.',
    type: 'website',
    locale: 'fr_FR',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#030711',
  width: 'device-width',
  initialScale: 1,
  // L'utilisateur doit pouvoir zoomer : bloquer le pincement casse
  // l'accessibilité pour un gain esthétique nul.
  maximumScale: 5,
};

/**
 * Ossature de la page.
 *
 * L'empilement est volontaire, du fond vers la surface :
 *   0. le décor — l'aurore et le massif, immobiles — voir FondHiver,
 *   1. le contenu, en verre translucide.
 *
 * Déconnecté, il n'y a ni colonne ni barre : l'accueil et la connexion
 * occupent toute la largeur. La session est lue ici une fois ; les pages
 * qui exigent d'être connecté le revérifient de leur côté (`exigeSession`).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Les overlays OBS (`/overlay/…`) se posent sur la vidéo du stream : ni
   * décor, ni menu, ni fond — une page transparente. C'est le middleware qui
   * le dit, par un en-tête qu'il pose lui-même et qu'il efface de toute
   * requête entrante : un visiteur ne peut pas le forger.
   */
  if ((await headers()).get('x-wl-surface') === 'overlay') {
    return (
      <html lang="fr" data-surface="overlay" className={`${barlow.variable} ${barlowCondensed.variable}`}>
        <body className="overlay-corps">{children}</body>
      </html>
    );
  }

  const connecte = (await getSession()) !== null;
  // Les évènements de subs en cours, pour la mini-bannière du haut. La base est
  // déjà chargée pour la page : la lecture est gardée le temps du rendu.
  const enCours = connecte ? await getStore().read((db) => evenementsActifs(db)) : [];
  return (
    <html lang="fr" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <FondHiver />

        {connecte && <Sidebar />}

        {/* Le contenu se décale de la largeur de la colonne à partir de lg.
            En dessous, la colonne n'existe pas : l'entête et la barre du bas
            prennent le relais. */}
        <div
          className="flex min-h-dvh flex-1 flex-col"
          style={{ ['--sidebar' as string]: connecte ? `${SIDEBAR_WIDTH}px` : '0px' }}
        >
          <EvenementsFlottants evenements={enCours} />
          <div className="flex flex-1 flex-col lg:pl-[var(--sidebar)]">
            {/* Toute la largeur, sans plafond : sur un grand écran, ce sont les
                grilles des pages qui gagnent des colonnes (paliers 3xl et 4xl),
                pas des marges vides. La réserve du bas, qui dégage la barre de
                navigation flottante des téléphones, est au pied de page : il
                n'y a de barre que pour un visiteur connecté. */}
            <main className="relative z-10 w-full flex-1 px-4 pt-6 pb-8 sm:px-6 sm:pt-8 lg:px-8 lg:pt-6 lg:pb-10 2xl:px-10">
              {children}
            </main>
            <PiedDePage barreMobile={connecte} />
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
