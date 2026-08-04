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
