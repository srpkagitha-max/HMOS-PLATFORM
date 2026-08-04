# HMOS Changelog

## V2.7.1 – Institute Login Completion
- Remembered institute code and faster repeat login.
- Password show/hide control.
- Institute login timeout and clearer errors.
- Restored sessions are validated against Firestore in the background.
- Active, inactive and expired access is rechecked from the Institute Portal.
- Stable V2.7.0 server-confirmed institute update flow retained.

# HMOS Changelog

## V2.7.0 Stable Firestore Save
- Replaced hanging Firestore SDK edit write with authenticated Firestore REST PATCH.
- Added a hard 15-second abort timeout and exact HTTP/Firebase error codes.
- Edit modal now closes only after the server confirms the save.
- Removed misleading queued/background-success message.
- Bumped all executable filenames and cache keys to V2.7.0.

# HMOS Changelog

## V2.6.6 — Verified Save & Cache Reset Fix
- Built directly from the user's uploaded working project.
- Edit Institute now leaves the Saving screen immediately and syncs Firestore in the background.
- Failed background saves restore the previous values and show the exact error on Dashboard.
- Added Firestore automatic long-polling detection for restrictive mobile networks.
- Renamed JavaScript modules so stale service-worker files cannot be reused.
- Added one-time removal of old service workers and caches.
- Registered a new V2.6.6 service worker with `updateViaCache: none`.
