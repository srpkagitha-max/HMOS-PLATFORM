# HMOS V3.2.5 — Official Firebase ESM Fix

This patch fixes `HMOS startup error: Unexpected reserved word`.

Cause: Firebase modular imports were pointed to cdnjs files that are not compatible with the app's native ES-module import style.

Upload all files in this patch to the repository root. No Firestore Rules change is required.
