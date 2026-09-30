import type { Metadata } from 'next';
import { OverlayBooster } from '@/components/overlay/OverlayBooster';
import { OverlayRefus } from '@/components/overlay/OverlayRefus';
import { accesOverlay } from '@/lib/services/overlay';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Overlay — boosters', robots: { index: false, follow: false } };

/** L'overlay OBS des ouvertures de boosters. Source conseillée : 1920 × 1080. */
export default async function OverlayBoosterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const acces = await accesOverlay(params);
  if (!acces.ok) return <OverlayRefus motif={acces.motif} />;
  return <OverlayBooster cle={acces.cle} depart={acces.depart} demo={acces.demo} son={params.son === '1'} />;
}
