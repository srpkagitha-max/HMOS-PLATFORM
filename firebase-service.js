import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);

const normalizeCode = value => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const cleanText = value => String(value || "").trim();

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function loginSuperAdmin(email, password) {
  await persistenceReady;
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutCurrentUser() { await signOut(auth); }
export function watchAuth(callback) { return onAuthStateChanged(auth, callback); }

export async function getCurrentUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function listInstitutes() {
  const snapshot = await getDocs(query(collection(db, "institutes"), orderBy("createdAt", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export function generateInstituteCode(name = "HMOS") {
  const prefix = String(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "HMOS";
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${suffix}`;
}

export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const random = new Uint32Array(8);
  crypto.getRandomValues(random);
  return `Hm@${[...random].map(value => alphabet[value % alphabet.length]).join("")}`;
}

function subscriptionDates(startValue, months = 12) {
  const start = startValue ? new Date(startValue) : new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + Number(months || 12));
  return { start, end };
}

export async function createInstitute(input, actorUid) {
  const instituteCode = normalizeCode(input.instituteCode || generateInstituteCode(input.instituteName));
  if (!instituteCode) throw Object.assign(new Error("Invalid institute code"), { code: "invalid-institute-code" });

  const accessRef = doc(db, "instituteAccess", instituteCode);
  if ((await getDoc(accessRef)).exists()) {
    throw Object.assign(new Error("Institute code already exists"), { code: "institute-code-exists" });
  }

  const instituteId = `HMOS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const temporaryPassword = input.temporaryPassword || generateTemporaryPassword();
  const passwordHash = await sha256(`${instituteCode}:${temporaryPassword}`);
  const { start, end } = subscriptionDates(input.subscriptionStart, input.subscriptionMonths || 12);

  const record = {
    instituteId,
    instituteCode,
    instituteName: cleanText(input.instituteName),
    hostelType: input.hostelType,
    ownerName: cleanText(input.ownerName),
    ownerPhone: cleanText(input.ownerPhone),
    ownerEmail: cleanText(input.ownerEmail).toLowerCase(),
    city: cleanText(input.city),
    address: cleanText(input.address),
    subscriptionPlan: Number(input.subscriptionMonths || 12) === 12 ? "yearly" : `${Number(input.subscriptionMonths || 12)}-months`,
    subscriptionStatus: "active",
    subscriptionStart: Timestamp.fromDate(start),
    subscriptionEnd: Timestamp.fromDate(end),
    status: "active",
    studentLimit: Number(input.studentLimit),
    currentStudents: 0,
    enabledModules: { admissions: true, students: true, rooms: true, fees: true, entryExit: false, food: false },
    portalAccessStatus: "active",
    mustChangePassword: true,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    isArchived: false,
    version: 2.4
  };

  await setDoc(doc(db, "institutes", instituteId), record);
  await setDoc(accessRef, {
    instituteId,
    instituteCode,
    instituteName: record.instituteName,
    hostelType: record.hostelType,
    ownerPhone: record.ownerPhone,
    ownerEmail: record.ownerEmail,
    city: record.city,
    address: record.address,
    passwordHash,
    status: "active",
    subscriptionStatus: "active",
    subscriptionEnd: record.subscriptionEnd,
    mustChangePassword: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: instituteId, ...record, temporaryPassword };
}

const withTimeout = (promise, milliseconds = 12000, code = "request-timeout") =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("Firebase request timed out"), { code })), milliseconds))
  ]);

export async function updateInstitute(instituteId, input, actorUid) {
  const ref = doc(db, "institutes", instituteId);
  const snap = await withTimeout(getDoc(ref), 10000, "read-timeout");
  if (!snap.exists()) throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  const current = snap.data();
  const updates = {
    instituteName: cleanText(input.instituteName),
    hostelType: input.hostelType,
    ownerName: cleanText(input.ownerName),
    ownerPhone: cleanText(input.ownerPhone),
    ownerEmail: cleanText(input.ownerEmail).toLowerCase(),
    city: cleanText(input.city),
    address: cleanText(input.address),
    studentLimit: Number(input.studentLimit),
    updatedAt: serverTimestamp(),
    updatedBy: actorUid
  };

  // Save the main institute first so the Edit screen never stays stuck forever.
  await withTimeout(updateDoc(ref, updates), 12000, "save-timeout");

  // Keep the login-access mirror in sync, but do not roll back a successful
  // institute edit if the secondary access record is unavailable.
  let accessSyncWarning = false;
  try {
    await withTimeout(setDoc(doc(db, "instituteAccess", current.instituteCode), {
      instituteId,
      instituteCode: current.instituteCode,
      instituteName: updates.instituteName,
      hostelType: updates.hostelType,
      ownerPhone: updates.ownerPhone,
      ownerEmail: updates.ownerEmail,
      city: updates.city,
      address: updates.address,
      status: current.status || "active",
      subscriptionStatus: current.subscriptionStatus || "active",
      subscriptionEnd: current.subscriptionEnd || null,
      mustChangePassword: current.mustChangePassword !== false,
      updatedAt: serverTimestamp()
    }, { merge: true }), 8000, "access-sync-timeout");
  } catch (error) {
    console.warn("HMOS access mirror sync warning:", error);
    accessSyncWarning = true;
  }

  return { id: instituteId, ...current, ...updates, accessSyncWarning };
}

export async function setInstituteStatus(instituteId, status, actorUid) {
  const ref = doc(db, "institutes", instituteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  const current = snap.data();
  await updateDoc(ref, { status, portalAccessStatus: status, updatedAt: serverTimestamp(), updatedBy: actorUid });
  await setDoc(doc(db, "instituteAccess", current.instituteCode), { instituteId, instituteCode: current.instituteCode, instituteName: current.instituteName, status, updatedAt: serverTimestamp() }, { merge: true });
}

export async function archiveInstitute(instituteId, actorUid) {
  const ref = doc(db, "institutes", instituteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  const current = snap.data();
  await updateDoc(ref, { isArchived: true, status: "inactive", portalAccessStatus: "inactive", archivedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: actorUid });
  await setDoc(doc(db, "instituteAccess", current.instituteCode), { instituteId, instituteCode: current.instituteCode, instituteName: current.instituteName, status: "inactive", updatedAt: serverTimestamp() }, { merge: true });
}

export async function restoreInstitute(instituteId, actorUid) {
  const ref = doc(db, "institutes", instituteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  const current = snap.data();
  await updateDoc(ref, { isArchived: false, status: "active", portalAccessStatus: "active", updatedAt: serverTimestamp(), updatedBy: actorUid });
  await setDoc(doc(db, "instituteAccess", current.instituteCode), { instituteId, instituteCode: current.instituteCode, instituteName: current.instituteName, status: "active", updatedAt: serverTimestamp() }, { merge: true });
}

export async function resetInstitutePassword(instituteId, newPassword, actorUid) {
  const ref = doc(db, "institutes", instituteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  const current = snap.data();
  const password = newPassword || generateTemporaryPassword();
  const passwordHash = await sha256(`${current.instituteCode}:${password}`);
  await setDoc(doc(db, "instituteAccess", current.instituteCode), {
    instituteId,
    instituteCode: current.instituteCode,
    instituteName: current.instituteName,
    hostelType: current.hostelType || "hostel",
    ownerPhone: current.ownerPhone || "",
    ownerEmail: current.ownerEmail || "",
    city: current.city || "",
    address: current.address || "",
    passwordHash,
    status: current.status || "active",
    subscriptionStatus: current.subscriptionStatus || "active",
    subscriptionEnd: current.subscriptionEnd || null,
    mustChangePassword: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await updateDoc(ref, { mustChangePassword: true, updatedAt: serverTimestamp(), updatedBy: actorUid });
  return password;
}

export async function renewSubscription(instituteId, months, actorUid) {
  const ref = doc(db, "institutes", instituteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  const current = snap.data();
  const existingEnd = current.subscriptionEnd?.toDate?.() || new Date();
  const base = existingEnd > new Date() ? existingEnd : new Date();
  const end = new Date(base);
  end.setMonth(end.getMonth() + Number(months || 12));
  await updateDoc(ref, {
    subscriptionEnd: Timestamp.fromDate(end), subscriptionStatus: "active", status: "active", portalAccessStatus: "active",
    updatedAt: serverTimestamp(), updatedBy: actorUid
  });
  await setDoc(doc(db, "instituteAccess", current.instituteCode), {
    instituteId,
    instituteCode: current.instituteCode,
    instituteName: current.instituteName,
    subscriptionEnd: Timestamp.fromDate(end),
    subscriptionStatus: "active",
    status: "active",
    updatedAt: serverTimestamp()
  }, { merge: true });
  return end;
}

export async function loginInstitute(instituteCode, password) {
  const code = normalizeCode(instituteCode);
  if (!code || !password) throw Object.assign(new Error("Missing credentials"), { code: "missing-credentials" });
  const snapshot = await getDoc(doc(db, "instituteAccess", code));
  if (!snapshot.exists()) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-institute-credential" });
  const access = snapshot.data();
  const passwordHash = await sha256(`${code}:${password}`);
  if (passwordHash !== access.passwordHash) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-institute-credential" });
  if (access.status !== "active") throw Object.assign(new Error("Account inactive"), { code: "institute-inactive" });
  if (access.subscriptionEnd?.toDate && access.subscriptionEnd.toDate() < new Date()) {
    throw Object.assign(new Error("Subscription expired"), { code: "subscription-expired" });
  }
  return { instituteCode: code, ...access };
}

export async function changeInstitutePassword(instituteCode, currentPassword, newPassword) {
  const code = normalizeCode(instituteCode);
  if (!code || !currentPassword || !newPassword) throw Object.assign(new Error("Missing credentials"), { code: "missing-credentials" });
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw Object.assign(new Error("Weak password"), { code: "weak-institute-password" });
  }
  const ref = doc(db, "instituteAccess", code);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-institute-credential" });
  const access = snapshot.data();
  const currentHash = await sha256(`${code}:${currentPassword}`);
  if (currentHash !== access.passwordHash) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-institute-credential" });
  const passwordHash = await sha256(`${code}:${newPassword}`);
  await updateDoc(ref, { passwordHash, mustChangePassword: false, updatedAt: serverTimestamp() });
  if (access.instituteId) {
    await updateDoc(doc(db, "institutes", access.instituteId), { mustChangePassword: false, updatedAt: serverTimestamp() }).catch(() => undefined);
  }
  return { instituteCode: code, ...access, passwordHash: undefined, mustChangePassword: false };
}
