import { notFound } from 'next/navigation';
import { FicheJoueur } from '@/components/FicheJoueur';
import { exigeSession } from '@/lib/auth/acces';
import { getFicheJoueur, getPublicProfile, subsDuJoueur } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  return { title: profile ? profile.pseudo : 'Joueur inconnu' };
}

/** La fiche d'un joueur : voir `components/FicheJoueur`. */
export default async function FicheJoueurPage({ params }: { params: Promise<{ slug: string }> }) {
  await exigeSession();
  const { slug } = await params;
  const fiche = await getFicheJoueur(slug);
  if (!fiche) notFound();
  return <FicheJoueur fiche={fiche} subs={await subsDuJoueur(fiche.twitchId)} />;
}
