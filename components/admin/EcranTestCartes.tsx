'use client';

import { useEffect, useRef, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Filtres, Panneau, Pastille } from '@/components/admin/Kit';
import { CardFrame } from '@/components/CardFrame';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITIES, type MomentCarte, type PackId } from '@/lib/domain/types';
import type { CarteDeTest, VueTestCartes } from '@/lib/services/cartesDeTest';

/** Quand la carte joue, en clair. */
const MOMENT: Record<MomentCarte, string> = {
  PROCHAINE: 'sur ta prochaine game',
  JOUEE: 'sur une game déjà jouée',
  INSTANT: 'tout de suite',
  GARDEE: 'gardée, jouée à la main',
};

/** Une carte qui attend une game : bloquée tant qu'une autre attend déjà. */
const attendUneGame = (c: CarteDeTest) => c.moment === 'PROCHAINE' || c.moment === 'JOUEE';

/**
 * La page de test : un booster, ses cartes rangées par rareté, et un clic pour
 * se donner celle qu'on veut essayer. La carte choisie s'affiche en bas, avec
 * le bouton qui la donne : un clic de travers ne donne rien.
 *
 * Le navigateur n'envoie que le booster, la carte et une clé ; le serveur
 * vérifie que la carte sort de ce booster et que le compte est celui d'un
 * testeur (`donneCarteDeTest`).
 */
export function EcranTestCartes({ vue }: { vue: VueTestCartes }) {
  const { busy, message, envoie, setMessage } = useAction();
  const [boosterId, setBoosterId] = useState<PackId>(vue.boosters[0]?.id ?? 'perso');
  const [choisie, setChoisie] = useState<CarteDeTest | null>(null);
  const [cle, setCle] = useState(() => crypto.randomUUID());
  const bouton = useRef<HTMLButtonElement>(null);

  // La carte choisie : le focus passe au bouton qui la donne, sans traverser
  // tout le booster au clavier.
  useEffect(() => {
    if (choisie) bouton.current?.focus();
  }, [choisie]);

  const booster = vue.boosters.find((b) => b.id === boosterId) ?? vue.boosters[0];
  const bloquee = (c: CarteDeTest) => vue.enAttente !== null && attendUneGame(c);

  function choisis(c: CarteDeTest) {
    setChoisie(c);
    setCle(crypto.randomUUID());
  }

  async function donne() {
    if (!choisie || !booster) return;
    const data = await envoie(
      '/api/admin/test/cartes',
      { packId: booster.id, cardId: choisie.id, cle },
      { cle: 'donne', succes: `${choisie.nom} est à toi.` },
    );
    if (!data) return;
    const resultat = typeof data.resultat === 'string' ? data.resultat : null;
    setMessage({
      kind: 'success',
      text: resultat
        ? `${choisie.nom} : ${resultat}.`
        : `${choisie.nom} est à toi : elle joue ${MOMENT[choisie.moment]}.`,
    });
    setChoisie(null);
    setCle(crypto.randomUUID());
  }

  async function retire() {
    await envoie('/api/admin/test/cartes', {}, { methode: 'DELETE', cle: 'retire', succes: 'Carte retirée.' });
  }

  /** Retirer les données fictives se confirme : un premier clic le propose, le second le fait. */
  const [confirmeRetrait, setConfirmeRetrait] = useState(false);
  async function fictives(action: 'ajoute' | 'retire') {
    setConfirmeRetrait(false);
    const data = await envoie(
      '/api/admin/test/fictives',
      { action },
      { cle: `fictives-${action}`, succes: action === 'ajoute' ? 'Données fictives ajoutées.' : 'Données fictives retirées.' },
    );
    if (!data) return;
    const n = (k: string) => Number(data[k] ?? 0);
    setMessage({
      kind: 'success',
      text:
        action === 'ajoute'
          ? `${n('joueurs')} joueurs fictifs, ${n('games')} games, ${n('cartes')} cartes et ${n('boosters')} boosters à ouvrir ajoutés.`
          : `${n('joueurs')} joueurs fictifs retirés, avec leurs ${n('games')} games et ${n('cartes')} cartes.`,
    });
  }

  return (
    <EcranAdmin
      grille="test"
      intro={
        <>
          Donne-toi n’importe quelle carte pour voir ce qu’elle fait. Elle tombe sur{' '}
          <strong>{vue.pseudo}</strong> et compte pour de vrai — score, flocons, Jokers — et le journal la garde.
          Rien ne part dans le tchat.
        </>
      }
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      <Panneau
        zone="fictives"
        titre="Données fictives"
        surtitre={vue.fictifs > 0 ? `${vue.fictifs} joueurs fictifs dans la ligue` : 'Aucune donnée fictive'}
        ton={vue.fictifs > 0 ? 'or' : 'glace'}
        sousTitre="24 joueurs inventés, avec leurs games, leurs points, leurs flocons et leurs cartes actives, et 7 boosters de la ligue à ouvrir (4 Commu, 3 Folie) : de quoi essayer les ouvertures et les cartes. À retirer avant le lancement de la saison."
        actions={
          vue.fictifs === 0 ? (
            <button
              type="button"
              className="btn btn-sm btn-ice"
              disabled={busy !== null}
              onClick={() => fictives('ajoute')}
            >
              {busy === 'fictives-ajoute' ? 'Ajout…' : 'Ajouter les données fictives'}
            </button>
          ) : confirmeRetrait ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => fictives('retire')}>
                {busy === 'fictives-retire' ? 'Retrait…' : `Retirer les ${vue.fictifs} joueurs fictifs`}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setConfirmeRetrait(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => setConfirmeRetrait(true)}>
              Retirer les données fictives
            </button>
          )
        }
      >
        <p className="adm-note">
          Ils sont dans le classement comme de vrais joueurs ; leurs cartes ne passent ni dans le tchat ni sur
          l’overlay du live. Les retirer efface aussi leurs games, leurs flocons, leurs cartes et les boosters
          fictifs pas encore ouverts.
        </p>
      </Panneau>

      <Panneau
        zone="cartes"
        titre="Test des cartes"
        surtitre="Réservé aux testeurs"
        ton="or"
        defile
        actions={
          <Filtres
            options={vue.boosters.map((b) => ({ cle: b.id, nom: b.nom.replace('Booster ', ''), compte: b.cartes.length }))}
            valeur={boosterId}
            onChange={(k) => {
              setBoosterId(k);
              setChoisie(null);
            }}
          />
        }
      >
        <div className="test-etat">
          {vue.enAttente ? (
            <p>
              <Pastille ton="or">En attente</Pastille> <strong>{vue.enAttente}</strong> attend ta prochaine game : les
              cartes qui attendent une game sont grisées tant qu’elle n’a pas joué.
              {vue.enAttenteRetirable ? (
                <button type="button" className="btn btn-sm ml-2" disabled={busy !== null} onClick={retire}>
                  {busy === 'retire' ? 'Retrait…' : 'La retirer'}
                </button>
              ) : (
                <> Elle vient d’un vrai booster : elle ne se retire pas.</>
              )}
            </p>
          ) : (
            <p>
              <Pastille ton="aurore">Libre</Pastille> Aucune carte n’attend ta prochaine game.
            </p>
          )}
          {vue.gardees.length > 0 && (
            <p>
              <Pastille ton="glace">Gardées</Pastille>{' '}
              {vue.gardees.map((g) => (g.nombre > 1 ? `${g.nom} ×${g.nombre}` : g.nom)).join(' · ')}
            </p>
          )}
        </div>

        {booster &&
          RARITIES.map((r) => {
            const cartes = booster.cartes.filter((c) => c.rarity === r);
            if (cartes.length === 0) return null;
            return (
              <section key={r} className="test-rarete" style={{ ['--teinte' as string]: `var(--r-${r.toLowerCase()})` }}>
                <h3 className="test-rarete-titre">
                  {RARITY_META[r].label} <span>{cartes.length}</span>
                </h3>
                <ul className="test-cartes">
                  {cartes.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="test-carte"
                        aria-pressed={choisie?.id === c.id}
                        aria-label={`${c.nom} — ${c.action}, ${MOMENT[c.moment]}`}
                        disabled={bloquee(c) || busy !== null}
                        onClick={() => choisis(c)}
                        title={`${c.nom} — ${c.description}`}
                      >
                        <span className="test-carte-visuel">
                          <CardFrame
                            cardId={c.id}
                            name={c.nom}
                            rarity={c.rarity}
                            glyph={c.glyph}
                            nature={c.nature}
                            largeur="120px"
                          />
                        </span>
                        <b>{c.nom}</b>
                        <small>{c.action}</small>
                        <small className="test-carte-moment">{MOMENT[c.moment]}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

        {choisie && (
          <div className="test-choix" role="region" aria-label="Carte choisie">
            <div className="min-w-0 flex-1">
              <p className="test-choix-nom">
                {choisie.nom} <span>· {booster?.nom}</span>
              </p>
              <p className="test-choix-texte">{choisie.description}</p>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => setChoisie(null)}>
              Annuler
            </button>
            <button ref={bouton} type="button" className="btn btn-ice btn-sm" disabled={busy !== null} onClick={donne}>
              {busy === 'donne' ? 'Don…' : 'Me la donner'}
            </button>
          </div>
        )}
      </Panneau>
    </EcranAdmin>
  );
}
