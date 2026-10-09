import { describe, expect, it } from 'vitest';
import { LONGUEUR_MESSAGE_MAX, messageOuverture, type AnnonceOuverture } from '@/lib/domain/annonceBooster';

const base: AnnonceOuverture = {
  booster: { nom: 'Booster Perso', glyphe: '🎁' },
  carte: { nom: 'Congère', rarete: 'Commune', description: '+3 points sur ta prochaine game.', action: '+3 pts bonus' },
  gagnants: [{ pseudo: 'Jeex3', twitchLogin: 'jeex3' }],
  touteLaLigue: false,
};

describe('l’annonce d’une ouverture dans le tchat', () => {
  it('nomme le joueur d’un Booster Perso par son @, avec la carte, sa rareté et ce qu’elle fait', () => {
    expect(messageOuverture(base)).toBe(
      '🎁 Booster Perso ouvert ! @jeex3 a obtenu la carte Congère (Commune), qui fait : +3 points sur ta prochaine game.',
    );
  });

  it('nomme par son pseudo un joueur sans compte Twitch connu', () => {
    expect(messageOuverture({ ...base, gagnants: [{ pseudo: 'Givre', twitchLogin: null }] })).toContain(
      ' Givre a obtenu la carte',
    );
  });

  it('liste les joueurs tirés au sort, et dit ce que fait la carte sans les tutoyer', () => {
    const m = messageOuverture({
      ...base,
      booster: { nom: 'Booster Commu', glyphe: '📣' },
      gagnants: [
        { pseudo: 'A', twitchLogin: 'a' },
        { pseudo: 'B', twitchLogin: 'b' },
        { pseudo: 'C', twitchLogin: null },
      ],
    });
    expect(m).toBe(
      '📣 Booster Commu ouvert ! @a, @b et C ont obtenu la carte Congère (Commune), qui fait : +3 pts bonus.',
    );
  });

  it('compte au lieu de nommer au-delà de cinq joueurs', () => {
    const gagnants = Array.from({ length: 8 }, (_, i) => ({ pseudo: `J${i}`, twitchLogin: `j${i}` }));
    expect(messageOuverture({ ...base, gagnants })).toContain('@j0, @j1, @j2, @j3, @j4 et 3 autres ont obtenu');
  });

  it('dit « toute la ligue » quand la carte tombe sur tout le monde', () => {
    expect(messageOuverture({ ...base, touteLaLigue: true, gagnants: [] })).toBe(
      '🎁 Booster Perso ouvert ! Toute la ligue a obtenu la carte Congère (Commune), qui fait : +3 pts bonus.',
    );
  });

  it('ne dépasse jamais la longueur d’un message Twitch', () => {
    const long = { ...base, carte: { ...base.carte, description: 'x'.repeat(900) } };
    expect(messageOuverture(long).length).toBeLessThanOrEqual(LONGUEUR_MESSAGE_MAX);
  });
});
