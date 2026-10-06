import { TableauDeBord, type DonVue, type SubVue } from '@/components/admin/TableauDeBord';
import { exigeRole } from '@/lib/auth/acces';
import { chaineDeLaLigue, isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { nextMilestone } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { boostersDuGeste, persoEnAttente } from '@/lib/domain/twitchSubs';
import { boostersCadeauDonnes } from '@/lib/services/packs';
import { etatSubsTwitch } from '@/lib/services/twitchSubs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de bord — Modération' };

/** Assez de registre pour une saison de subs. */
const REGISTRE = 5000;

/** L'état du branchement Twitch, sans faire attendre l'écran plus de deux secondes. */
async function twitchBranche(): Promise<boolean | null> {
  if (!isTwitchEnabled()) return null;
  const etat = await Promise.race([
    etatSubsTwitch().catch(() => null),
    new Promise<null>((fin) => setTimeout(() => fin(null), 2000)),
  ]);
  return etat ? etat.branche : null;
}

/**
 * Le tableau de bord de la modération : les boosters cadeau à redonner, les
 * boosters à ouvrir, et le fil des subs. Les données sont lues ici ; l'écran
 * les raconte (`components/admin/TableauDeBord`).
 */
export default async function AdminAccueilPage() {
  await exigeRole('admin');
  const store = getStore();
  const chaine = chaineDeLaLigue();

  const [ligue, registre, branche] = await Promise.all([
    store.read((db) => {
      const pseudoDe = new Map(db.players.map((p) => [p.id, p.pseudo]));
      const enFile = new Map<string, number>();
      for (const p of db.packsDus) {
        if (p.packId === 'perso' && p.joueurId && p.ouvertureId === null) {
          enFile.set(p.joueurId, (enFile.get(p.joueurId) ?? 0) + 1);
        }
      }
      const actifs = db.players.filter((p) => p.active);
      return {
        inscrits: actifs.length,
        receveurs: actifs
          .filter((p) => !estLaStreameuse(p, chaine))
          .map((p) => ({ id: p.id, pseudo: p.pseudo, boostersPerso: enFile.get(p.id) ?? 0 }))
          .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
        // Tous les comptes Twitch connus, actifs ou non : un compte désactivé
        // n'est pas « pas sur le site ».
        twitchIds: db.players.map((p) => p.twitchId).filter((id): id is string => Boolean(id)),
        donnes: [...boostersCadeauDonnes(db)],
        dons: db.packsDus
          .filter((p) => p.donDe)
          .sort((a, b) => b.creeA.localeCompare(a.creeA))
          .slice(0, 20)
          .map((p) => ({ id: p.id, le: p.creeA, joueur: pseudoDe.get(p.joueurId ?? '') ?? '?', donDe: p.donDe! })),
        totalSubs: db.config.totalSubs,
        aOuvrir: {
          perso: db.packsDus.filter((p) => p.packId === 'perso' && p.joueurId && p.ouvertureId === null).length,
          ligue: db.packsDus.filter((p) => p.joueurId === null && p.ouvertureId === null).length,
        },
      };
    }),
    store.subsTwitch(REGISTRE),
    twitchBranche(),
  ]);

  const inscrits = new Set(ligue.twitchIds);
  const donateurs = persoEnAttente(registre, inscrits, new Map(ligue.donnes));
  const pseudoTwitch = new Map(registre.map((s) => [s.twitchId, s.pseudo]));
  const subs: SubVue[] = registre.map((s) => ({
    id: s.id,
    le: s.le,
    genre: s.genre,
    pseudo: s.pseudo,
    nombre: s.nombre,
    niveau: s.niveau,
    inscrit: s.twitchId === null ? null : inscrits.has(s.twitchId),
    boosters: boostersDuGeste({ niveau: s.niveau, nombre: s.nombre, anonyme: s.twitchId === null }),
  }));
  const dons: DonVue[] = ligue.dons.map((d) => ({
    id: d.id,
    le: d.le,
    joueur: d.joueur,
    donateur: pseudoTwitch.get(d.donDe) ?? 'quelqu’un hors du site',
  }));
  const prochain = nextMilestone(ligue.totalSubs);

  return (
    <TableauDeBord
      subs={subs}
      donateurs={donateurs}
      dons={dons}
      receveurs={ligue.receveurs}
      totalSubs={ligue.totalSubs}
      prochainPalier={prochain ? `${prochain.milestone.label} dans ${prochain.remaining}` : 'tous les paliers franchis'}
      inscrits={ligue.inscrits}
      aOuvrir={ligue.aOuvrir}
      twitchBranche={branche}
      maintenant={new Date().toISOString()}
    />
  );
}
