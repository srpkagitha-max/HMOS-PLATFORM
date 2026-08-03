# HMOS Platform — V2.1 Super Admin Foundation

## Included
- Premium institute landing page
- Firebase Email/Password Super Admin login
- Firestore-backed authorization using `users/{uid}`
- Super Admin dashboard
- Institute list and create-institute workflow
- Multi-institute starter security rules
- PWA shell and GitHub Pages root deployment

## Required one-time setup
1. Create the Super Admin account in Firebase Authentication.
2. Copy that user's UID.
3. In Firestore, create document `users/{UID}` with:
   - `userType`: `superAdmin`
   - `accountStatus`: `active`
   - `displayName`: your preferred administrator name
4. Publish the included `firestore.rules` in Firestore → Rules.

## Security note
Institute portal passwords are not stored in client-side code. Secure password generation and verification will be added through a server function in the next build.
