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
