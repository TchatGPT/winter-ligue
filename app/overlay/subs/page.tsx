import type { Metadata } from 'next';
import { OverlayRefus } from '@/components/overlay/OverlayRefus';
import { OverlaySubs } from '@/components/overlay/OverlaySubs';
import { accesOverlay } from '@/lib/services/overlay';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overlay — subs', robots: { index: false, follow: false } };

/** L'overlay OBS du compteur de subs. Source conseillée : 880 × 260. */
export default async function OverlaySubsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const acces = await accesOverlay(await searchParams);
  if (!acces.ok) return <OverlayRefus motif={acces.motif} />;
  return <OverlaySubs cle={acces.cle} depart={acces.depart} initial={acces.subs} demo={acces.demo} />;
}
