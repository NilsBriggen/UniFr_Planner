# Domain

The deterministic requirements engine and immutable programme packs live in
`src/requirements.ts` and `src/programmes.ts`. This pure TypeScript core runs
directly in the guest browser; HTTP handlers, persistence, clock reads and source
fetching remain in adapters. `npm test` runs its tests in `tests/*.test.ts` via
the web Vitest configuration. The `src/unifr_domain` Python namespace remains
available for backend-specific domain modules.

See [programme research](../../docs/programme-research.md) for source provenance,
allocation rules, explicit revision selection and current review limitations.
