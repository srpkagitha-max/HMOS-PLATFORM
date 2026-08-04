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
  collection,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);

const normalizeCode = value => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

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

export async function logoutCurrentUser() {
  await signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getCurrentUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
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
  const body = [...random].map(value => alphabet[value % alphabet.length]).join("");
  return `Hm@${body}`;
}

export async function createInstitute(input, actorUid) {
  const instituteCode = normalizeCode(input.instituteCode || generateInstituteCode(input.instituteName));
  if (!instituteCode) throw Object.assign(new Error("Invalid institute code"), { code: "invalid-institute-code" });

  const accessRef = doc(db, "instituteAccess", instituteCode);
  const accessSnapshot = await getDoc(accessRef);
  if (accessSnapshot.exists()) throw Object.assign(new Error("Institute code already exists"), { code: "institute-code-exists" });

  const instituteId = `HMOS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const temporaryPassword = input.temporaryPassword || generateTemporaryPassword();
  const passwordHash = await sha256(`${instituteCode}:${temporaryPassword}`);
  const now = new Date();
  const subscriptionEnd = new Date(now);
  subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);

  const record = {
    instituteId,
    instituteCode,
    instituteName: input.instituteName.trim(),
    hostelType: input.hostelType,
    ownerName: input.ownerName.trim(),
    ownerPhone: input.ownerPhone.trim(),
    subscriptionPlan: "yearly",
    subscriptionStatus: "active",
    subscriptionStart: Timestamp.fromDate(now),
    subscriptionEnd: Timestamp.fromDate(subscriptionEnd),
    status: "active",
    studentLimit: Number(input.studentLimit),
    enabledModules: {
      admissions: true,
      students: true,
      rooms: true,
      fees: true,
      entryExit: false,
      food: false
    },
    portalAccessStatus: "active",
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    isArchived: false,
    version: 2
  };

  await setDoc(doc(db, "institutes", instituteId), record);
  await setDoc(accessRef, {
    instituteId,
    instituteCode,
    instituteName: record.instituteName,
    passwordHash,
    status: "active",
    subscriptionEnd: record.subscriptionEnd,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: instituteId, ...record, temporaryPassword };
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
