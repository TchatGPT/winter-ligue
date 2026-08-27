<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:winter-ligue -->

# Winter Ligue — règles du projet

## Invariants à ne jamais casser

1. **Aucune valeur qui compte ne vient du client.** Le navigateur envoie des kills, un
   placement, un identifiant de carte ou de booster, un montant d'enchère. Le score,
   l'effet d'une carte, le contenu d'un booster et la recevabilité d'une enchère sont
   toujours décidés côté serveur.
2. **`lib/domain/` ne fait aucune entrée-sortie.** Pas de `fetch`, pas de cookie, pas
   d'accès base. Ce sont des fonctions pures, couvertes par `tests/`.
3. **Toute mutation passe par `getStore().transaction()`.** Jamais de
   lecture-modification-écriture hors transaction : c'est ce qui empêche les courses
   concurrentes sur les flocons.
4. **Aucun mouvement de flocons sans passer par `credit()` / `debit()` / `adjust()`.**
   Modifier `player.snowflakes` directement contourne le grand livre.
5. **Toute route d'API commence par `guard()`** — origine, débit, session, validation Zod.
   Une route qui l'oublie est une faille.
6. **`lib/domain/rng.ts` et tout module manipulant des secrets gardent
   `import 'server-only'`.**

## Conventions

- Interface, commentaires et messages d'erreur **en français**.
- Les constantes de saison vivent dans `lib/domain/rules.ts`, nulle part ailleurs.
- Le catalogue de cartes vit dans `lib/domain/catalog.ts`. Ajouter une carte, c'est
  ajouter une entrée là et une branche dans `applyEffect()` de `lib/services/cards.ts`.
- Les couleurs viennent des variables CSS de `app/globals.css`, jamais codées en dur.
- Avant de livrer : `npm run typecheck && npm test && npm run build`.

## Contexte

Le détail des protections et la liste de ce qui reste à faire avant la production sont
dans `docs/SECURITE.md`. Le lire avant de toucher à l'authentification, au stockage ou au
marché.
<!-- END:winter-ligue -->
