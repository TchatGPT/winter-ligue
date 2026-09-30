import { EcranSaison, type RetourSubs } from '@/components/admin/EcranSaison';
import { exigeRole } from '@/lib/auth/acces';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { etatSubsTwitch } from '@/lib/services/twitchSubs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saison — Modération' };

/** Ce que le retour du branchement des subs peut dire. Le texte vient d'ici, jamais de l'adresse. */
const RETOURS: Record<string, RetourSubs> = {
  branche: {
    kind: 'success',
    text: 'Subs Twitch branchés : chaque sub s’ajoute désormais tout seul au compteur.',
  },
  refuse: {
    kind: 'error',
    text: 'Seule la streameuse peut brancher les subs : Twitch doit être ouvert sur son compte, et elle doit accepter que la ligue voie ses subs.',
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
  const twitchConfigure = isTwitchEnabled();
  const [data, etatTwitch] = await Promise.all([
    getStore().read((db) => ({
      config: {
        maxGamesPerPlayer: db.config.maxGamesPerPlayer,
        totalSubs: db.config.totalSubs,
      },
      joueurs: db.players
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, pseudo: p.pseudo, subsOfferts: p.subsOfferts }))
        .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
      packsEnFile: db.packsDus.filter((p) => p.ouvertureId === null).length,
    })),
    // L'état se lit chez Twitch : c'est lui qui garde les abonnements.
    twitchConfigure ? etatSubsTwitch().catch(() => null) : Promise.resolve(null),
  ]);
  const brut = (await searchParams).subs;
  const retour = typeof brut === 'string' ? (RETOURS[brut] ?? null) : null;

  return (
    <EcranSaison
      config={data.config}
      joueurs={data.joueurs}
      packsEnFile={data.packsEnFile}
      estAdmin={session.role === 'admin'}
      twitch={{ configure: twitchConfigure, etat: etatTwitch, retour }}
    />
  );
}
