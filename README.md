# HMOS V4.0.1 — Performance & Stability Core (Phase 2)

Phase 2 adds cursor pagination, atomic transactions and duplicate protection on top of the clean V4 runtime.

## Main files
- `app.js`
- `firebase-service.js`
- `service-worker.js`
- `firestore.rules`
- `firestore.indexes.json`

## Important
Deploy the Firestore indexes before large-scale testing. Existing data remains compatible.
