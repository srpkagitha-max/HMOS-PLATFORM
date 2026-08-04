# Changelog

## v2.2.0 — Development Super Admin Access
- Fixed authorization block caused by Firebase Authentication UID and Firestore profile document mismatches.
- Allows only `hmos.superadmin@gmail.com` after successful Firebase Authentication.
- Keeps all other authenticated accounts blocked.
- Updated service worker to refresh JavaScript and Firebase configuration files from the network first.

> Development note: restore role-based Firestore authorization before production launch.
