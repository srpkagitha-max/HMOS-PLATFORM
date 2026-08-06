# HMOS V4.0.1 — Performance & Stability Core (Phase 2)

Phase 2 adds cursor pagination, atomic transactions and duplicate protection on top of the clean V4 runtime.

## Main files
- `app.js`
- `firebase-service.js`
- `service-worker.js`
- `firestore.rules`
- `firestore.indexes.json`

## Important
Deploy the Firestore indexes before large-scale testing. Existing data remains compatible.


## V4.1 Smart Admission & Admin Access
- Premium WhatsApp admission invitation with institute details and session password.
- Applicant status search using phone number.
- Approved applicant can print admission confirmation and payment receipt.
- Institute Admin Login defaults to admin / 12345 and can be changed under Settings.
