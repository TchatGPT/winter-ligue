import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Snowfall } from '@/components/Snowfall';
import { SEASON } from '@/lib/domain/rules';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
  // Un lien partagé sur Discord ou Twitter doit afficher une vignette lisible.
  openGraph: {
    title: 'Winter Ligue — Call of Duty Warzone',
    description: 'Classement, boosters, cartes et hôtel des ventes. Saison hivernale.',
    type: 'website',
    locale: 'fr_FR',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#05080f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <Snowfall />
        <SiteHeader />
        <main className="relative z-10 mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <SiteFooter season={`${SEASON.name} — ${SEASON.edition}`} />
      </body>
    </html>
  );
}
