'use client';

import { useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { FicheCarte } from '@/components/FicheCarte';
import { RarityChip, rarityMeta } from '@/components/ui';
import type { MomentCarte, Rarity } from '@/lib/domain/types';

/**
 * Les cartes de la saison, rangées par rareté.
 *
 * Sous les boosters, toutes les cartes du jeu d'un coup, groupées de la
 * commune à la légendaire : ce qu'on peut tirer, et ce que chaque rareté
 * pèse. Ce n'est plus la planche du booster choisi — on cherche « que fait
 * une légendaire », pas « que contient ce booster ».
 *
 * Une tuile par carte : **l'action** en titre, le nom de la carte, ce qu'elle
 * fait en clair, puis quand elle se joue. Les malus sont teintés de rouge.
 *
 * Toute la tuile s'ouvre : la carte vient en grand, en relief
 * (`FicheCarte`, `CarteInclinable`).
 */

export interface CarteSaison {
  cardId: string;
  name: string;
  /** L'intitulé de l'action : « Multiplicateur game », « Joker »… */
  action: string;
  rarity: Rarity;
  glyph: string;
  description: string;
  power: number;
  nature: 'bonus' | 'malus';
  moment: MomentCarte;
  /** Ce qu'elle peut faire bouger sur une game, au plus. Nul si elle ne touche pas au score. */
  impact: number | null;
}

const ECHELLE: Rarity[] = ['C', 'R', 'UR', 'L'];

const MOMENTS: Record<MomentCarte, string> = {
  PROCHAINE: 'Prochaine game',
  JOUEE: 'Game déjà jouée',
  INSTANT: 'Tout de suite',
  GARDEE: 'Gardée, à jouer au choix',
};

export function CartesParRarete({ cartes }: { cartes: CarteSaison[] }) {
  const malus = cartes.filter((c) => c.nature === 'malus').length;
  const [ouverte, setOuverte] = useState<CarteSaison | null>(null);

  return (
    <div className="space-y-8">
      <p className="text-[14px] text-muted">
        {cartes.length} carte{cartes.length > 1 ? 's' : ''} cette saison, de la commune à la légendaire.
        {malus > 0 && ` ${malus} malus parmi elles, teinté${malus > 1 ? 's' : ''} de rouge.`} Plus la carte est
        rare, plus elle peut peser sur une game.
      </p>

      {ECHELLE.map((rarete) => {
        const lot = cartes
          .filter((c) => c.rarity === rarete)
          .sort((a, b) => a.power - b.power || a.name.localeCompare(b.name, 'fr'));
        if (lot.length === 0) return null;
        const meta = rarityMeta(rarete);
        return (
          <section key={rarete} aria-labelledby={`rarete-${rarete}`} style={{ ['--r' as string]: meta.color }}>
            <header className="rarete-tete">
              <RarityChip rarity={rarete} taille={28} />
              <h4 id={`rarete-${rarete}`}>{meta.label}</h4>
              <span className="rarete-compte">
                {lot.length} carte{lot.length > 1 ? 's' : ''}
              </span>
            </header>

            <ul className="actions-grille">
              {lot.map((c) => (
                <li key={c.cardId} className="action-tuile" data-nature={c.nature}>
                  <button
                    type="button"
                    className="action-tuile-ouvre"
                    aria-label={`Voir ${c.name} en grand`}
                    onClick={() => setOuverte(c)}
                  />
                  <span className="action-carte" aria-hidden="true">
                    <CardFrame cardId={c.cardId} name={c.name} rarity={c.rarity} glyph={c.glyph} nature={c.nature} />
                  </span>

                  <div className="min-w-0">
                    <h5 className="action-titre">{c.action}</h5>
                    <p className="action-nom">{c.name}</p>
                    <p className="action-texte">{c.description.replace(/^MALUS : /, '')}</p>
                    <p className="action-pied">
                      {c.nature === 'malus' && <span data-genre="malus">Malus</span>}
                      <span>{MOMENTS[c.moment]}</span>
                      {c.impact !== null && <span>{c.impact} pts au plus</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {ouverte && (
        <FicheCarte
          carte={{
            cardId: ouverte.cardId,
            nom: ouverte.name,
            action: ouverte.action,
            rarity: ouverte.rarity,
            glyph: ouverte.glyph,
            description: ouverte.description.replace(/^MALUS : /, ''),
            nature: ouverte.nature,
            power: ouverte.power,
          }}
          legende={
            <>
              Se joue : {MOMENTS[ouverte.moment].toLowerCase()}
              {ouverte.impact !== null && ` · ${ouverte.impact} pts au plus`}.
            </>
          }
          onClose={() => setOuverte(null)}
        />
      )}
    </div>
  );
}
