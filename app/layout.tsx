import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { MountainRange } from '@/components/MountainRange';
import { Sidebar, SIDEBAR_WIDTH } from '@/components/Sidebar';
import { SiteFooter } from '@/components/SiteFooter';
import { Snowfall } from '@/components/Snowfall';
import { SEASON } from '@/lib/domain/rules';
import './globals.css';

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
    'La ligue hivernale Warzone : classement, boosters, cartes bonus et malus, et hôtel des ventes en flocons.',
  applicationName: 'Winter Ligue',
  openGraph: {
    title: 'Winter Ligue — Call of Duty Warzone',
    description: 'Classement, boosters, cartes et hôtel des ventes. Saison hivernale.',
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
 *   0. l'aurore et les montagnes — ce que le verre laisse passer,
 *   1. le grain, qui casse les dégradés,
 *   2. la neige,
 *   3. le contenu, en verre translucide.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <div className="aurora" aria-hidden="true">
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
          <span className="a4" />
        </div>
        <MountainRange />
        <div className="grain" aria-hidden="true" />
        <Snowfall />

        <Sidebar />

        {/* Le contenu se décale de la largeur de la colonne à partir de lg.
            En dessous, la colonne n'existe pas : l'entête et la barre du bas
            prennent le relais. */}
        <div
          className="flex min-h-dvh flex-1 flex-col"
          style={{ ['--sidebar' as string]: `${SIDEBAR_WIDTH}px` }}
        >
          <div className="flex flex-1 flex-col lg:pl-[var(--sidebar)]">
            <main className="relative z-10 mx-auto w-full max-w-[1320px] flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:pt-6">
              {children}
            </main>

            <SiteFooter season={`${SEASON.name} — ${SEASON.edition}`} />
          </div>
        </div>
      </body>
    </html>
  );
}
