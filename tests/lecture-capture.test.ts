import { describe, expect, it } from 'vitest';
import { genreColonne, killsDeLaLigne } from '@/lib/domain/lectureCapture';

/**
 * Les kills d'une capture de fin de game (23/11/2026) : ÉLIM./ASSIST. moins
 * ASSIST., contrôlés par la colonne ÉLIM. — le modèle prenait ÉLIM./ASSIST.
 * pour les kills.
 */
const ENTETES = ['SCORE', 'ÉLIM./ASSIST.', 'ÉLIM.', 'ASSIST.'];

describe('les colonnes d’une capture', () => {
  it('reconnaît les en-têtes, en français comme en anglais', () => {
    expect(ENTETES.map(genreColonne)).toEqual(['score', 'elimAssist', 'elim', 'assist']);
    expect(['Score', 'Kills/Assists', 'Kills', 'Assists'].map(genreColonne)).toEqual([
      'score',
      'elimAssist',
      'elim',
      'assist',
    ]);
    expect(genreColonne('ÉLIM / ASSIST')).toBe('elimAssist');
    expect(genreColonne('DÉGÂTS')).toBe('autre');
  });

  it('prend ÉLIM./ASSIST. − ASSIST. pour les kills, comme sur la capture d’AshGGs, Vaerys et BizTouFly', () => {
    // Le modèle lisait 26, 21 et 2 : la colonne ÉLIM./ASSIST.
    expect(killsDeLaLigne(ENTETES, [11480, 26, 25, 1], 26)).toMatchObject({ kills: 25, attendu: 25, elim: 25 });
    expect(killsDeLaLigne(ENTETES, [10970, 21, 19, 2], 21)).toMatchObject({ kills: 19, attendu: 19, elim: 19 });
    expect(killsDeLaLigne(ENTETES, [4525, 2, 1, 1], 2)).toMatchObject({ kills: 1, attendu: 1, elim: 1 });
  });

  it('garde ÉLIM. comme contrôle : un écart se voit', () => {
    const lus = killsDeLaLigne(ENTETES, [7475, 18, 12, 5]);
    expect(lus.kills).toBe(13);
    expect(lus.elim).toBe(12);
  });

  it('se rabat sur ÉLIM. seule, puis sur la lecture du modèle', () => {
    expect(killsDeLaLigne(['SCORE', 'ÉLIM.'], [3000, 9], 4).kills).toBe(9);
    expect(killsDeLaLigne(['SCORE', 'ÉLIM./ASSIST.', 'ÉLIM.', 'ASSIST.'], [3000, null, 7, 2], 4).kills).toBe(7);
    expect(killsDeLaLigne([], [], 6).kills).toBe(6);
    // Des nombres qui ne collent pas aux en-têtes : on ne devine pas.
    expect(killsDeLaLigne(ENTETES, [11480, 26, 25], 26).kills).toBe(26);
  });
});
