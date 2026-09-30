import { headers } from 'next/headers';
import { EcranOverlays } from '@/components/admin/EcranOverlays';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { cleOverlay } from '@/lib/services/overlay';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overlays — Modération' };

/**
 * Les overlays OBS du stream : leurs liens, leur aperçu, et de quoi les
 * révoquer. Le lien porte une clé — voir `lib/services/overlay.ts`.
 */
export default async function AdminOverlaysPage() {
  const session = await exigeRole('admin');
  const generation = await getStore().read((db) => db.config.overlayGeneration ?? 1);

  const hote = (await headers()).get('host');
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || (hote ? `https://${hote}` : '')).replace(/\/$/, '');

  return (
    <EcranOverlays
      base={base}
      cle={cleOverlay(generation)}
      depart={new Date().toISOString()}
      estAdmin={session.role === 'admin'}
    />
  );
}
