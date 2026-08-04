# HMOS V3.0.0

Institute Admin and Student Management module. Upload the files and publish firestore.rules.

# HMOS V2.9.0

Student Login and Student Portal foundation. Upload the V2.9.0 files and publish firestore.rules.

# HMOS V2.8.2 – Admission Validation Fix

- New executable filenames force Chrome to load the latest admission code.
- Phone and Aadhaar inputs are normalized to digits before validation.
- Admission save flow remains unchanged.

# HMOS V2.8.1

This build completes the New Admission save flow.

## Admission transaction
One Save Admission action creates:
- `admissions/{admissionId}`
- `students/{studentId}`
- `studentAccess/{studentId}`
- increments `institutes/{instituteId}.currentStudents`

The student receives an auto-generated temporary password, shown only on the success screen for copying and sharing.

## Deployment
Upload the patch files to the repository root, commit, then copy `firestore.rules` to Firebase Firestore Rules and publish.
