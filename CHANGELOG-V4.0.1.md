# HMOS V4.0.1 — Performance & Stability Core Phase 2

- Cursor-based resident pagination service (25 default, 100 maximum).
- Atomic Firestore transaction for bed allotment to prevent double booking.
- Atomic fee payment transaction to keep fee, resident and receipt records synchronized.
- Duplicate payment-reference protection.
- Duplicate-admission detection by institute, resident phone, parent phone, name and DOB.
- Required composite Firestore indexes included.
- Existing V3.7 features and V4 Phase 1 UI retained.
