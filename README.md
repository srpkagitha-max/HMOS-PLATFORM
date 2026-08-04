# HMOS v2.6.5
This hotfix prevents institute edits from hanging indefinitely and adds Firebase request timeouts.

## V2.6.1 — Institute Update + PWA Install Hotfix
- Atomic institute and instituteAccess updates.
- Exact Firestore error codes in the UI.
- Correct instituteAccess rules included.
- Chrome-installable PWA with app icons and Install HMOS prompt.
- Fresh cache version.

# HMOS Platform — v2.4 Institute Management Pro

Static Firebase-powered multi-institute hostel management platform.

## Deploy
Upload all files to the repository root. GitHub Pages: main branch, root folder.
Publish `firestore.rules` in Firebase Firestore Rules.

## Included
- Super Admin authentication
- Institute creation and portal login
- Search, edit, activate/deactivate, archive/restore
- Password reset and subscription renewal
- Mobile-first dashboard with cached first paint

## Security note
Institute password verification is client-side for development. Before commercial production, migrate institute authentication and password management to Firebase Authentication or a trusted server/Cloud Function.


## Current build
V2.4.1 Mobile UI Fix


## Version 2.5
Institute management actions now use safe, mobile-friendly dialogs for editing, access control, password resets, plan renewals, login sharing, archive and restore.


## V2.6 Institute Portal
Institute login, mandatory first-login password change, remembered non-sensitive portal session, and welcome cards are enabled. The public first-login password update is a development-stage implementation; production must move password verification and changes to a Firebase Cloud Function.
