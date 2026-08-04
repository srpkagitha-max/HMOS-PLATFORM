# HMOS v2.3.1 — Instant Open

- Removed Firebase CDN modules from the critical first-render path.
- Login screen now renders before Firebase downloads.
- Firebase authentication restores in the background after first paint.
- Added a tiny inline boot placeholder to avoid a blank white screen.
- Updated service worker to fetch fresh JavaScript and HTML while caching static assets.
- Preserved Phase 1 institute creation and fast cached dashboard.

# HMOS Changelog

## v2.3.0 — Phase 1 + Fast Access
- Faster dashboard opening with local institute cache and parallel Firebase reads.
- Firebase Auth persistence enabled so repeat logins restore faster.
- Added preconnect/module preload and a stale-while-revalidate service worker.
- Institute creation now saves a stable auto-generated HMOS Institute ID.
- Institute codes and temporary passwords can be generated automatically.
- Added one-year subscription start/end dates.
- Dashboard counts update immediately without a second Firestore fetch.
- Generated institute credentials are shown once with a Copy Login button.
- Institute login is enabled using a development-stage SHA-256 access record.
- Added `instituteAccess` Firestore rules.

> Security note: Institute password verification is suitable for development/testing. Before commercial production, move institute credential creation and verification to Firebase Cloud Functions or Firebase Authentication custom claims.
