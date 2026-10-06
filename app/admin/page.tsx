import { VueEnsemble, type DonVue, type JoueurVue, type SubVue } from '@/components/admin/VueEnsemble';
import { exigeRole } from '@/lib/auth/acces';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { nextMilestone } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { boostersDuGeste, persoEnAttente } from '@/lib/domain/twitchSubs';
import { boostersCadeauDonnes } from '@/lib/services/packs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vue d’ensemble — Modération' };

/** Assez de registre pour une saison de subs. */
const REGISTRE = 5000;

/**
 * La vue d'ensemble : les subs de la saison, les boosters cadeau — les Booster
 * Perso payés par des non-inscrits, à redonner à des joueurs de la ligue — et
 * les joueurs inscrits. Les données sont lues ici ; l'écran les cherche, les
 * filtre, les trie et les feuillette (`components/admin/VueEnsemble`).
 */
export default async function AdminAccueilPage() {
  await exigeRole('admin');
  const store = getStore();
  const chaine = chaineDeLaLigue();

  const [ligue, registre] = await Promise.all([
    store.read((db) => {
      const pseudoDe = new Map(db.players.map((p) => [p.id, p.pseudo]));
      const enFile = new Map<string, number>();
      for (const p of db.packsDus) {
        if (p.packId === 'perso' && p.joueurId && p.ouvertureId === null) {
          enFile.set(p.joueurId, (enFile.get(p.joueurId) ?? 0) + 1);
        }
      }
      return {
        joueurs: db.players
          .filter((p) => p.active)
          .map((p): JoueurVue & { twitchId: string | null } => ({
            id: p.id,
            slug: p.slug,
            pseudo: p.pseudo,
            twitchId: p.twitchId,
            inscritLe: p.joinedAt,
            statut: estLaStreameuse(p, chaine) ? 'streameuse' : p.role === 'admin' ? 'modération' : 'joueur',
            boostersPerso: enFile.get(p.id) ?? 0,
          })),
        // Tous les comptes Twitch connus, actifs ou non : un compte désactivé
        // n'est pas « pas inscrit ».
        twitchIds: db.players.map((p) => p.twitchId).filter((id): id is string => Boolean(id)),
        donnes: [...boostersCadeauDonnes(db)],
        dons: db.packsDus
          .filter((p) => p.donDe)
          .sort((a, b) => b.creeA.localeCompare(a.creeA))
          .map((p) => ({ id: p.id, le: p.creeA, joueur: pseudoDe.get(p.joueurId ?? '') ?? '?', donDe: p.donDe! })),
        totalSubs: db.config.totalSubs,
      };
    }),
    store.subsTwitch(REGISTRE),
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
    donateur: pseudoTwitch.get(d.donDe) ?? 'un non-inscrit',
  }));
  const prochain = nextMilestone(ligue.totalSubs);

  return (
    <VueEnsemble
      subs={subs}
      donateurs={donateurs}
      dons={dons}
      joueurs={ligue.joueurs.map(({ twitchId: _twitchId, ...j }) => j)}
      totalSubs={ligue.totalSubs}
      prochainPalier={prochain ? `${prochain.milestone.label} dans ${prochain.remaining}` : 'tous les paliers franchis'}
    />
  );
}
