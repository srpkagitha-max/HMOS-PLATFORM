# HMOS Changelog

## v2.4.1 — Mobile UI Fix
- Fixed stale CSS loading on GitHub Pages with versioned assets and network-first CSS.
- Redesigned Institute Manage screen for small phones.
- Added premium detail cards, responsive action buttons, safe text wrapping and compact logout placement.
- Improved spacing and touch targets without changing Firestore data or functions.


## v2.4.0 — Institute Management Pro
- Search and status filters for institute list.
- Edit institute owner, location, hostel type and student capacity.
- Activate/deactivate institute portal access.
- Soft archive and restore institutes.
- Reset temporary institute passwords.
- Renew subscriptions by one year.
- Copy and WhatsApp login credentials.
- Live active, expired and archived dashboard counters.
- Cached dashboard first paint with background Firestore refresh.
- Mobile management UI improvements.

## v2.4.2
- Removed duplicated stylesheet payload introduced in v2.4.1.
- Rebuilt Institute Manage screen as a single isolated render block.
- Fixed repeated detail cards and repeated action buttons on mobile.
- Improved compact two-column actions and safe text wrapping.
- Updated cache version to force fresh CSS and JavaScript.
