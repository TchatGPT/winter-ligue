import 'server-only';

import { getStore } from '@/lib/db/store';
import { messageOuverture } from '@/lib/domain/annonceBooster';
import { getCard, getPack, RARITY_META } from '@/lib/domain/catalog';
import { audit } from '@/lib/services/ledger';
import { joueursEnLice } from '@/lib/services/packs';
import { annonceDansLeTchat } from '@/lib/services/twitchChat';

/** Une ouverture plus ancienne ne s'annonce plus : on ne réveille pas la soirée. */
const FRAICHEUR_MS = 30 * 60_000;

export type ResultatAnnonce = 'envoye' | 'deja' | 'introuvable' | 'echec';

/**
 * Annonce une ouverture de booster dans le tchat de la chaîne, une fois et
 * une seule.
 *
 * Deux écrans la demandent quand la carte est révélée : l'overlay OBS — ce
 * que voit le stream —, et à défaut l'écran de qui a ouvert le booster,
 * quelques secondes plus tard. Le premier arrivé marque l'ouverture
 * (`annonceeA`) dans la transaction ; le second ne fait rien. Le texte est
 * composé ici, d'après la base (`messageOuverture`). L'envoi, réussi ou non,
 * est au journal.
 */
export async function annonceOuverture(ouvertureId: string, acteur: string): Promise<ResultatAnnonce> {
  const prise = await getStore().transaction((db) => {
    const o = db.ouvertures.find((x) => x.id === ouvertureId);
    if (!o) return { etat: 'introuvable' as const };
    if (o.annonceeA || Date.now() - Date.parse(o.openedAt) > FRAICHEUR_MS) return { etat: 'deja' as const };
    const pack = getPack(o.packId);
    const card = getCard(o.cardId);
    if (!pack || !card) return { etat: 'introuvable' as const };
    o.annonceeA = new Date().toISOString();

    const touteLaLigue =
      o.joueurId === null && card.cible === 'TOUS' && o.beneficiaires.length >= joueursEnLice(db).length;
    const ids = o.joueurId ? [o.joueurId] : o.beneficiaires;
    const gagnants = ids
      .map((id) => db.players.find((p) => p.id === id))
      .filter((p) => p !== undefined)
      .map((p) => ({ pseudo: p.pseudo, twitchLogin: p.twitchLogin }));
    return {
      etat: 'a-envoyer' as const,
      message: messageOuverture({
        booster: { nom: pack.name, glyphe: pack.glyph },
        carte: {
          nom: card.name,
          rarete: RARITY_META[card.rarity].label,
          description: card.description,
          action: card.subtitle,
        },
        gagnants,
        touteLaLigue,
      }),
    };
  });
  if (prise.etat !== 'a-envoyer') return prise.etat;

  const envoi = await annonceDansLeTchat(prise.message);
  await getStore().transaction((db) => {
    audit(
      db,
      acteur,
      envoi.envoye ? 'BOOSTER_ANNONCE_TCHAT' : 'BOOSTER_ANNONCE_REFUSEE',
      ouvertureId,
      envoi.envoye ? prise.message : `${envoi.raison} : ${envoi.detail}`,
    );
  });
  return envoi.envoye ? 'envoye' : 'echec';
}
