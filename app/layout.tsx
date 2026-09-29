import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { FondHiver } from '@/components/FondHiver';
import { Sidebar, SIDEBAR_MARGE, SIDEBAR_WIDTH } from '@/components/Sidebar';
import { getSession } from '@/lib/auth/session';
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
 *   0. le décor — la montagne et la neige — voir FondHiver,
 *   1. le contenu, en verre translucide.
 *
 * Déconnecté, il n'y a ni colonne ni barre : l'accueil et la connexion
 * occupent toute la largeur. La session est lue ici une fois ; les pages
 * qui exigent d'être connecté le revérifient de leur côté (`exigeSession`).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const connecte = (await getSession()) !== null;
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
          style={{ ['--sidebar' as string]: connecte ? `${SIDEBAR_WIDTH + SIDEBAR_MARGE * 2}px` : '0px' }}
        >
          <div className="flex flex-1 flex-col lg:pl-[var(--sidebar)]">
            {/* La réserve du bas doit dégager la barre de navigation flottante,
                qui fait 78 px du bord de l'écran. Elle était à 64 : le bouton
                d'ouverture et le solde passaient dessous, en bas de la page des
                boosters. Sur grand écran la barre n'existe pas, et la réserve
                redevient une simple marge. */}
            <main className="relative z-10 mx-auto w-full max-w-[1880px] flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:px-8 lg:pt-6 lg:pb-16 2xl:px-10">
              {children}
            </main>

          </div>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
