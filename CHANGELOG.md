# HMOS V2.8.0 — New Admission Foundation

- Working New Admission form from Institute Portal.
- Auto-generated Student ID and Admission ID.
- Student, parent, contact, joining and address fields.
- Firestore admissions save with validation.
- Admission success receipt with Print / Save PDF.
- Mobile responsive form and print layout.
- Updated PWA cache and Firestore Rules.

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

## V2.7.2 – First Login Password Fix
- Fixed first-login password change permission failure.
- Added exact error messages and request timeout recovery.
- Hardened Firestore rule so unauthenticated update can change only passwordHash, mustChangePassword and updatedAt.
- Updated executable filenames and cache version to prevent stale JavaScript.
