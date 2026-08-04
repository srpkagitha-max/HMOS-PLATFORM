import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  initializeFirestore,
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
const db = initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });
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

export async function updateInstitute(instituteId, input, actorUid, existingRecord = null) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Super Admin session expired"), { code: "auth-required" });

  const token = await getIdToken(user, true);
  const updates = {
    instituteName: cleanText(input.instituteName),
    hostelType: cleanText(input.hostelType),
    ownerName: cleanText(input.ownerName),
    ownerPhone: cleanText(input.ownerPhone),
    ownerEmail: cleanText(input.ownerEmail).toLowerCase(),
    city: cleanText(input.city),
    address: cleanText(input.address),
    studentLimit: Number(input.studentLimit),
    updatedAt: new Date().toISOString(),
    updatedBy: actorUid
  };

  const fields = {
    instituteName: { stringValue: updates.instituteName },
    hostelType: { stringValue: updates.hostelType },
    ownerName: { stringValue: updates.ownerName },
    ownerPhone: { stringValue: updates.ownerPhone },
    ownerEmail: { stringValue: updates.ownerEmail },
    city: { stringValue: updates.city },
    address: { stringValue: updates.address },
    studentLimit: { integerValue: String(updates.studentLimit) },
    updatedAt: { timestampValue: updates.updatedAt },
    updatedBy: { stringValue: String(actorUid || "") }
  };

  const mask = Object.keys(fields)
    .map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/institutes/${encodeURIComponent(instituteId)}?${mask}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields }),
      signal: controller.signal,
      cache: "no-store"
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("Institute save timed out"), { code: "save-timeout" });
    }
    throw Object.assign(error || new Error("Network save failed"), { code: error?.code || "network-save-failed" });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = null;
    try { detail = await response.json(); } catch {}
    const statusCode = response.status === 403 ? "permission-denied" : response.status === 404 ? "not-found" : `http-${response.status}`;
    const error = new Error(detail?.error?.message || `Firestore save failed (${response.status})`);
    error.code = statusCode;
    error.details = detail;
    throw error;
  }

  const current = existingRecord || {};
  const instituteCode = current.instituteCode || normalizeCode(input.instituteCode);
  if (instituteCode) {
    const mirrorFields = {
      instituteId: { stringValue: instituteId },
      instituteCode: { stringValue: instituteCode },
      instituteName: { stringValue: updates.instituteName },
      hostelType: { stringValue: updates.hostelType },
      ownerPhone: { stringValue: updates.ownerPhone },
      ownerEmail: { stringValue: updates.ownerEmail },
      city: { stringValue: updates.city },
      address: { stringValue: updates.address },
      updatedAt: { timestampValue: updates.updatedAt }
    };
    const mirrorMask = Object.keys(mirrorFields).map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
    const mirrorUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/instituteAccess/${encodeURIComponent(instituteCode)}?${mirrorMask}`;
    fetch(mirrorUrl, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: mirrorFields })
    }).catch(error => console.warn("HMOS access mirror sync warning:", error));
  }

  return { id: instituteId, ...current, ...updates };
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
  const snapshot = await withTimeout(getDoc(doc(db, "instituteAccess", code)), 9000, "institute-login-timeout");
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


export async function validateInstituteSession(instituteCode) {
  const code = normalizeCode(instituteCode);
  if (!code) throw Object.assign(new Error("Missing institute code"), { code: "missing-credentials" });
  const snapshot = await withTimeout(getDoc(doc(db, "instituteAccess", code)), 9000, "institute-session-timeout");
  if (!snapshot.exists()) throw Object.assign(new Error("Institute access record not found"), { code: "invalid-institute-session" });
  const access = snapshot.data();
  if (access.status !== "active") throw Object.assign(new Error("Institute inactive"), { code: "institute-inactive" });
  const end = access.subscriptionEnd?.toDate?.();
  if (end && end < new Date()) throw Object.assign(new Error("Subscription expired"), { code: "subscription-expired" });
  return { instituteCode: code, ...access, passwordHash: undefined };
}
export async function changeInstitutePassword(instituteCode, currentPassword, newPassword) {
  const code = normalizeCode(instituteCode);
  if (!code || !currentPassword || !newPassword) throw Object.assign(new Error("Missing credentials"), { code: "missing-credentials" });
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw Object.assign(new Error("Weak password"), { code: "weak-institute-password" });
  }
  const ref = doc(db, "instituteAccess", code);
  const snapshot = await withTimeout(getDoc(ref), 9000, "password-change-timeout");
  if (!snapshot.exists()) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-institute-credential" });
  const access = snapshot.data();
  const currentHash = await sha256(`${code}:${currentPassword}`);
  if (currentHash !== access.passwordHash) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-institute-credential" });
  const passwordHash = await sha256(`${code}:${newPassword}`);
  try {
    await withTimeout(updateDoc(ref, {
      passwordHash,
      mustChangePassword: false,
      updatedAt: serverTimestamp()
    }), 12000, "password-change-timeout");
  } catch (error) {
    if (error?.code === "permission-denied") throw error;
    if (error?.code === "password-change-timeout") throw error;
    throw Object.assign(error || new Error("Password update failed"), { code: error?.code || "password-update-failed" });
  }
  if (access.instituteId) {
    updateDoc(doc(db, "institutes", access.instituteId), {
      mustChangePassword: false,
      updatedAt: serverTimestamp()
    }).catch(() => undefined);
  }
  return { instituteCode: code, ...access, passwordHash: undefined, mustChangePassword: false };
}


export function generateStudentId(instituteCode = "HMOS") {
  const code = normalizeCode(instituteCode) || "HMOS";
  const year = String(new Date().getFullYear()).slice(-2);
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return `${code}-${year}${String(1000 + (random[0] % 9000))}`;
}

export async function createStudentAdmission(input, instituteSession) {
  const instituteCode = normalizeCode(instituteSession?.instituteCode);
  const instituteId = cleanText(instituteSession?.instituteId);
  if (!instituteCode || !instituteId) {
    throw Object.assign(new Error("Institute session missing"), { code: "institute-session-missing" });
  }

  const studentName = cleanText(input.studentName);
  const parentName = cleanText(input.parentName);
  const parentPhone = cleanText(input.parentPhone);
  const studentPhone = cleanText(input.studentPhone);
  const emergencyPhone = cleanText(input.emergencyPhone);
  const aadhaarLast4 = cleanText(input.aadhaarLast4);
  if (!studentName || !parentName || !/^\d{10}$/.test(parentPhone)) {
    throw Object.assign(new Error("Admission details invalid"), { code: "invalid-admission-details" });
  }
  if ((studentPhone && !/^\d{10}$/.test(studentPhone)) || (emergencyPhone && !/^\d{10}$/.test(emergencyPhone)) || (aadhaarLast4 && !/^\d{4}$/.test(aadhaarLast4))) {
    throw Object.assign(new Error("Admission details invalid"), { code: "invalid-admission-details" });
  }

  const studentId = normalizeCode(input.studentId || generateStudentId(instituteCode));
  const studentRef = doc(db, "students", studentId);
  const existingStudent = await getDoc(studentRef);
  if (existingStudent.exists()) {
    throw Object.assign(new Error("Student ID already exists"), { code: "duplicate-student-id" });
  }

  const instituteRef = doc(db, "institutes", instituteId);
  const instituteSnapshot = await getDoc(instituteRef);
  if (!instituteSnapshot.exists()) {
    throw Object.assign(new Error("Institute not found"), { code: "institute-not-found" });
  }
  const instituteData = instituteSnapshot.data();
  const currentStudents = Number(instituteData.currentStudents || 0);
  const studentLimit = Number(instituteData.studentLimit || 0);
  if (studentLimit > 0 && currentStudents >= studentLimit) {
    throw Object.assign(new Error("Student capacity reached"), { code: "student-limit-reached" });
  }

  const admissionId = `${instituteCode}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await sha256(`${studentId}:${temporaryPassword}`);
  const joiningDate = cleanText(input.joiningDate) || new Date().toISOString().slice(0,10);
  const common = {
    admissionId,
    studentId,
    instituteId,
    instituteCode,
    instituteName: cleanText(instituteSession.instituteName),
    studentName,
    dateOfBirth: cleanText(input.dateOfBirth),
    gender: cleanText(input.gender),
    courseOrClass: cleanText(input.courseOrClass),
    studentPhone,
    parentName,
    parentRelation: cleanText(input.parentRelation),
    parentPhone,
    emergencyPhone,
    aadhaarLast4,
    joiningDate,
    address: cleanText(input.address),
    notes: cleanText(input.notes)
  };

  const batch = writeBatch(db);
  batch.set(doc(db, "admissions", admissionId), {
    ...common,
    status: "approved",
    studentAccountCreated: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(studentRef, {
    ...common,
    status: "active",
    accountStatus: "active",
    roomId: "",
    bedId: "",
    feesStatus: "not-set",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "studentAccess", studentId), {
    studentId,
    instituteId,
    instituteCode,
    studentName,
    passwordHash,
    mustChangePassword: true,
    accountStatus: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.update(instituteRef, {
    currentStudents: currentStudents + 1,
    updatedAt: serverTimestamp()
  });
  await withTimeout(batch.commit(), 15000, "admission-save-timeout");
  return {
    ...common,
    status: "approved",
    temporaryPassword,
    currentStudents: currentStudents + 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}
