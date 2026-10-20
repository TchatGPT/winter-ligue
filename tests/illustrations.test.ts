import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOSTER_ART, CARD_ART, CARD_VIGNETTES } from '@/lib/domain/card-art.generated';

/**
 * L'index des illustrations dit vrai : chaque adresse mène à un fichier, avec
 * l'empreinte de ce fichier — sans quoi le cache d'un an (`next.config.ts`)
 * garderait une image remplacée. Et chaque carte illustrée a ses vignettes :
 * sans elles, le rail retéléchargerait les illustrations entières.
 */

const PUBLIC = join(process.cwd(), 'public');
const fichier = (adresse: string) => join(PUBLIC, adresse.split('?')[0]);
const empreinte = (chemin: string) => createHash('sha256').update(readFileSync(chemin)).digest('hex').slice(0, 10);

describe('l’index des illustrations', () => {
  it('mène à des fichiers qui existent, avec leur empreinte', () => {
    for (const adresse of [...Object.values(CARD_ART), ...Object.values(BOOSTER_ART)]) {
      expect(existsSync(fichier(adresse)), adresse).toBe(true);
      expect(new URL(adresse, 'https://x').searchParams.get('v'), adresse).toBe(empreinte(fichier(adresse)));
    }
  });

  it('donne ses deux vignettes à chaque carte illustrée', () => {
    for (const [id, adresse] of Object.entries(CARD_ART)) {
      const v = CARD_VIGNETTES[id];
      expect(v, id).toBeDefined();
      const source = empreinte(fichier(adresse));
      for (const [vignette, largeur] of [
        [v.petite, 200],
        [v.moyenne, 480],
      ] as const) {
        // Le nom porte l'empreinte de l'illustration : une vignette d'une ancienne image ne sert jamais.
        expect(vignette, id).toBe(`/cartes/vignettes/${id}.${source}.${largeur}.webp`);
        expect(existsSync(fichier(vignette)), vignette).toBe(true);
      }
      expect(v.srcset).toBe(`${v.petite} 200w, ${v.moyenne} 480w, ${adresse} 1000w`);
    }
  });
});
