import type { Metadata } from 'next';
import { OverlayDuel } from '@/components/overlay/OverlayDuel';
import { OverlayRefus } from '@/components/overlay/OverlayRefus';
import { accesOverlay } from '@/lib/services/overlay';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overlay — duels', robots: { index: false, follow: false } };

/** L'overlay OBS des duels lancés. Source conseillée : 1200 × 420. */
export default async function OverlayDuelPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const acces = await accesOverlay(await searchParams);
  if (!acces.ok) return <OverlayRefus motif={acces.motif} />;
  return <OverlayDuel cle={acces.cle} depart={acces.depart} demo={acces.demo} />;
}
