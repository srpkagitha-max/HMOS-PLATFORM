# V2.6.5 — Non-blocking Institute Save

- Fixed Update Institute remaining on “Saving…” indefinitely.
- Firestore save now runs in the background and the UI returns immediately.
- Added asynchronous success/error reporting for the actual server write.
- Avoided caching Firestore serverTimestamp sentinel objects in localStorage.

# HMOS Changelog

## v2.6.5 — Direct Save Fix
- Institute edit now uses one direct Firestore merge write.
- Removed the blocking read-before-write step.
- instituteAccess mirror sync runs in the background and never blocks the screen.
- Added a hard UI timeout so the Save button always recovers.

## v2.6.5 — Save Timeout Hotfix
- Prevents Edit Institute from remaining on “Saving…” indefinitely.
- Saves the main institute record first.
- Syncs instituteAccess as a secondary, time-limited operation.
- Adds clear timeout error messages and always restores the button.

## V2.6.1 — Institute Update + PWA Install Hotfix
- Atomic institute and instituteAccess updates.
- Exact Firestore error codes in the UI.
- Correct instituteAccess rules included.
- Chrome-installable PWA with app icons and Install HMOS prompt.
- Fresh cache version.

# HMOS Changelog

## v2.6.0 — Institute Portal Foundation
- Working institute login with inactive and subscription-expiry checks.
- Mandatory first-login password change with strong-password validation.
- Remember-institute session without storing the password.
- Premium institute welcome portal with New Admission, Student Login and Admin Login cards.
- Institute branding/contact/subscription summary available from the access profile.
- Faster returning portal session and safe logout.
- Updated development Firestore rule for first-login password change.


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


## v2.5.0 — Safe Institute Actions
- Added premium in-app dialogs instead of browser confirm boxes.
- Added modal Edit Institute workflow.
- Added password reset confirmation, generator, copy and WhatsApp sharing.
- Added 6-month, 1-year and 2-year subscription renewal choices with end-date previews.
- Added activate/deactivate confirmations with progress and error states.
- Added typed ARCHIVE protection and a safe restore flow.
- Added dedicated Share Login dialog and secure password visibility messaging.
- Updated mobile bottom-sheet layout and cache version.

## v2.6.2 — PWA Install + Access Repair
- Fixed Chrome installability with explicit GitHub Pages scope/start URL.
- Added root-level 192px and 512px icons so mobile GitHub uploads do not lose the icon folder.
- Install HMOS button now remains visible until the app is installed.
- Missing instituteAccess records are rebuilt automatically during edit, reset, status, archive, restore, and renewal actions.
