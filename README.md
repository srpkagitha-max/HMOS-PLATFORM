# HMOS V4.0.0 — Performance & Stability Core (Phase 1)

This build consolidates the runtime to one `app.js`, one `firebase-service.js`, and one `service-worker.js`.

## Phase 1 changes
- Removed runtime dependence on old version-numbered JavaScript files.
- Replaced cross-institute collection scans with institute-scoped Firestore queries.
- Added safe result limits to heavy lists.
- Added offline/online status banner and central startup error display.
- Added network-first navigation caching and automatic removal of old caches.
- Updated cache/session keys to V4.
- Kept all V3.7.2 features and data paths compatible.

## Upload
Upload every file in this folder to the repository root. Old versioned files can be removed after V4 is verified.
