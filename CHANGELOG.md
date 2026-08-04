# HMOS Changelog

## V2.8.1 — Admission Completion
- Admission save now creates admission, student profile and student login in one atomic Firestore batch.
- Duplicate Student ID check.
- Student capacity validation and institute current-student counter update.
- Auto-generated temporary student password.
- Copyable student login credentials on the success receipt.
- Improved validation and timeout messages.
- Updated Firestore rules for admissions, students and studentAccess.
