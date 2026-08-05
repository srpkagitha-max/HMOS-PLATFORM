# HMOS V3.2.4 CDN Startup Fix

This patch fixes the splash-screen startup hang by:
- switching Firebase browser-module imports from Google gstatic to Cloudflare cdnjs,
- removing cache/service-worker deletion from every page startup,
- using versioned V3.2.4 local module filenames.

Upload every file in this patch to the repository root.
