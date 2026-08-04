# HMOS Changelog

## V2.9.0
- Working Student Login with Student ID and password.
- First-login password change.
- Student dashboard with profile, room, fees and joining details.
- Student session validation foundation.

# HMOS V2.8.2 – Admission Validation Fix

- New executable filenames force Chrome to load the latest admission code.
- Phone and Aadhaar inputs are normalized to digits before validation.
- Admission save flow remains unchanged.

# HMOS Changelog

## V2.8.1 — Admission Completion
- Admission save now creates admission, student profile and student login in one atomic Firestore batch.
- Duplicate Student ID check.
- Student capacity validation and institute current-student counter update.
- Auto-generated temporary student password.
- Copyable student login credentials on the success receipt.
- Improved validation and timeout messages.
- Updated Firestore rules for admissions, students and studentAccess.
