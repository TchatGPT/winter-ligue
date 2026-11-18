import { EcranSaison, type RetourSubs } from '@/components/admin/EcranSaison';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { playerIdOf } from '@/lib/auth/session';
import { estResponsableSaison } from '@/lib/services/saisons';
import { bilanSaison } from '@/lib/services/bilanSaison';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saison — Modération' };

/**
 * Ce que le retour du branchement des subs peut dire — depuis le bandeau du
 * tableau de bord, si Twitch venait à se débrancher. Le texte vient d'ici,
 * jamais de l'adresse.
 */
const RETOURS: Record<string, RetourSubs> = {
  branche: {
    kind: 'success',
    text: 'Twitch branché : chaque sub payé s’ajoute tout seul au compteur, sans les Prime, et les codes cadeaux s’annoncent dans le tchat.',
  },
  refuse: {
    kind: 'error',
    text: 'Seule la streameuse peut brancher Twitch : il doit être ouvert sur son compte, et elle doit accepter que la ligue lise et écrive dans son tchat.',
  },
  erreur: {
    kind: 'error',
    text: 'Twitch a refusé le branchement. Réessaie dans un instant ; le détail est au journal.',
  },
};

export default async function AdminSaisonPage({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  const session = await exigeRole('admin');
  const data = await getStore().read((db) => ({
    numero: db.config.numero ?? 1,
    bilan: bilanSaison(db),
    responsable: estResponsableSaison(db, playerIdOf(session)),
  }));
  const brut = (await searchParams).subs;
  const retour = typeof brut === 'string' ? (RETOURS[brut] ?? null) : null;

  return <EcranSaison numero={data.numero} bilan={data.bilan} responsable={data.responsable} retour={retour} />;
}
