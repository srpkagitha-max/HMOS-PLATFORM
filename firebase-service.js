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
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  where,
  limit,
  getDocs,
  getCountFromServer,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction,
  startAfter,
  documentId
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);

const normalizeCode = value => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const cleanText = value => String(value || "").trim();
const DEFAULT_PAGE_SIZE = 25;
const safePageSize = value => Math.min(100, Math.max(10, Number(value || DEFAULT_PAGE_SIZE)));
const RETRYABLE_CODES = new Set(["unavailable", "deadline-exceeded", "resource-exhausted", "network-request-failed"]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withRetry(operation, { attempts = 3, baseDelay = 350 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      const code = String(error?.code || "").replace("firestore/", "");
      if (!RETRYABLE_CODES.has(code) || attempt === attempts) throw error;
      await sleep(baseDelay * (2 ** (attempt - 1)) + Math.floor(Math.random() * 150));
    }
  }
  throw lastError;
}

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
    upiId: cleanText(input.upiId),
    defaultTotalFees: Number(input.defaultTotalFees||0),
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
    upiId: record.upiId,
    defaultTotalFees: record.defaultTotalFees,
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
    upiId: cleanText(input.upiId),
    defaultTotalFees: Number(input.defaultTotalFees||0),
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
    upiId: { stringValue: updates.upiId },
    defaultTotalFees: { integerValue: String(updates.defaultTotalFees) },
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
      upiId: { stringValue: updates.upiId },
      defaultTotalFees: { integerValue: String(updates.defaultTotalFees) },
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
  const snapshot = await withRetry(() => withTimeout(getDoc(doc(db, "instituteAccess", code)), 9000, "institute-login-timeout"));
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
  const snapshot = await withRetry(() => withTimeout(getDoc(doc(db, "instituteAccess", code)), 9000, "institute-session-timeout"));
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
  const parentPhone = cleanText(input.parentPhone).replace(/\D/g, "");
  const studentPhone = cleanText(input.studentPhone).replace(/\D/g, "");
  const emergencyPhone = cleanText(input.emergencyPhone).replace(/\D/g, "");
  const aadhaarLast4 = cleanText(input.aadhaarLast4).replace(/\D/g, "");
  if (!studentName || !parentName || !/^\d{10}$/.test(studentPhone) || !/^\d{10}$/.test(parentPhone)) {
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


export async function loginStudent(studentIdValue, password) {
  const studentId = normalizeCode(studentIdValue);
  if (!studentId || !password) throw Object.assign(new Error("Missing credentials"), { code: "missing-student-credentials" });
  const accessSnap = await withTimeout(getDoc(doc(db, "studentAccess", studentId)), 9000, "student-login-timeout");
  if (!accessSnap.exists()) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-student-credential" });
  const access = accessSnap.data();
  const hash = await sha256(`${studentId}:${password}`);
  if (hash !== access.passwordHash) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-student-credential" });
  if (access.accountStatus !== "active") throw Object.assign(new Error("Student inactive"), { code: "student-inactive" });
  const profileSnap = await withTimeout(getDoc(doc(db, "students", studentId)), 9000, "student-login-timeout");
  if (!profileSnap.exists()) throw Object.assign(new Error("Student profile missing"), { code: "student-profile-missing" });
  return { studentId, ...profileSnap.data(), mustChangePassword: Boolean(access.mustChangePassword) };
}

export async function changeStudentPassword(studentIdValue, currentPassword, newPassword) {
  const studentId = normalizeCode(studentIdValue);
  if (!studentId || !currentPassword || !newPassword) throw Object.assign(new Error("Missing credentials"), { code: "missing-student-credentials" });
  if (newPassword.length < 10 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    throw Object.assign(new Error("Weak password"), { code: "weak-student-password" });
  }
  const ref = doc(db, "studentAccess", studentId);
  const snap = await withTimeout(getDoc(ref), 9000, "student-password-timeout");
  if (!snap.exists()) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-student-credential" });
  const access = snap.data();
  const oldHash = await sha256(`${studentId}:${currentPassword}`);
  if (oldHash !== access.passwordHash) throw Object.assign(new Error("Invalid credentials"), { code: "invalid-student-credential" });
  const passwordHash = await sha256(`${studentId}:${newPassword}`);
  await withTimeout(updateDoc(ref, { passwordHash, mustChangePassword: false, updatedAt: serverTimestamp() }), 12000, "student-password-timeout");
  return { studentId, mustChangePassword: false };
}

export async function validateStudentSession(studentIdValue) {
  const studentId = normalizeCode(studentIdValue);
  if (!studentId) throw Object.assign(new Error("Missing student ID"), { code: "missing-student-credentials" });
  const [accessSnap, profileSnap] = await Promise.all([
    withTimeout(getDoc(doc(db, "studentAccess", studentId)), 9000, "student-session-timeout"),
    withTimeout(getDoc(doc(db, "students", studentId)), 9000, "student-session-timeout")
  ]);
  if (!accessSnap.exists() || !profileSnap.exists()) throw Object.assign(new Error("Student session invalid"), { code: "invalid-student-session" });
  const access = accessSnap.data();
  if (access.accountStatus !== "active") throw Object.assign(new Error("Student inactive"), { code: "student-inactive" });
  return { studentId, ...profileSnap.data(), mustChangePassword: Boolean(access.mustChangePassword) };
}


// V4 Phase 2 — cursor pagination and duplicate protection
export async function listInstituteStudentsPage(instituteCodeValue, { pageSize = DEFAULT_PAGE_SIZE, cursor = null } = {}) {
  const instituteCode = normalizeCode(instituteCodeValue);
  if (!instituteCode) throw Object.assign(new Error("Institute code missing"), { code: "institute-session-missing" });
  const constraints = [where("instituteCode", "==", instituteCode), orderBy(documentId()), limit(safePageSize(pageSize))];
  if (cursor) constraints.splice(2, 0, startAfter(cursor));
  const snap = await withTimeout(getDocs(query(collection(db, "students"), ...constraints)), 12000, "student-list-timeout");
  const items = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !item.isDeleted);
  return { items, nextCursor: snap.docs.at(-1) || null, hasMore: snap.docs.length === safePageSize(pageSize) };
}

export async function checkDuplicateAdmission({ instituteCode: codeValue, studentPhone, parentPhone, studentName, dateOfBirth }) {
  const instituteCode = normalizeCode(codeValue);
  const normalizedStudentPhone = cleanText(studentPhone).replace(/\D/g, "");
  const normalizedParentPhone = cleanText(parentPhone).replace(/\D/g, "");
  const nameKey = cleanText(studentName).toLowerCase();
  if (!instituteCode) return null;
  const checks = [];
  if (normalizedStudentPhone) checks.push(query(collection(db, "students"), where("instituteCode", "==", instituteCode), where("studentPhone", "==", normalizedStudentPhone), limit(1)));
  if (normalizedParentPhone && nameKey) checks.push(query(collection(db, "students"), where("instituteCode", "==", instituteCode), where("parentPhone", "==", normalizedParentPhone), limit(10)));
  for (const q of checks) {
    const snap = await withTimeout(getDocs(q), 9000, "duplicate-check-timeout");
    const match = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(r => !r.isDeleted && (!nameKey || cleanText(r.studentName).toLowerCase() === nameKey) && (!dateOfBirth || r.dateOfBirth === dateOfBirth));
    if (match) return match;
  }
  return null;
}

// V3.0 Institute Admin — Student Management
export async function listInstituteStudents(instituteCodeValue) {
  const instituteCode = normalizeCode(instituteCodeValue);
  if (!instituteCode) throw Object.assign(new Error("Institute code missing"), { code: "institute-session-missing" });
  const q = query(collection(db, "students"), where("instituteCode", "==", instituteCode), limit(500));
  const snap = await withTimeout(getDocs(q), 12000, "student-list-timeout");
  return snap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => !item.isDeleted)
    .sort((a,b) => String(a.studentName||"").localeCompare(String(b.studentName||"")));
}

export async function updateStudentProfile(studentIdValue, input, instituteCodeValue) {
  const studentId = normalizeCode(studentIdValue);
  const instituteCode = normalizeCode(instituteCodeValue);
  if (!studentId || !instituteCode) throw Object.assign(new Error("Student reference missing"), { code: "student-reference-missing" });
  const ref = doc(db, "students", studentId);
  const snap = await withTimeout(getDoc(ref), 9000, "student-read-timeout");
  if (!snap.exists() || normalizeCode(snap.data().instituteCode) !== instituteCode) {
    throw Object.assign(new Error("Student not found"), { code: "student-not-found" });
  }
  const parentPhone = cleanText(input.parentPhone).replace(/\D/g, "");
  const studentPhone = cleanText(input.studentPhone).replace(/\D/g, "");
  if (!cleanText(input.studentName) || !cleanText(input.parentName) || !/^\d{10}$/.test(parentPhone) || (studentPhone && !/^\d{10}$/.test(studentPhone))) {
    throw Object.assign(new Error("Invalid student details"), { code: "invalid-student-details" });
  }
  const payload = {
    studentName: cleanText(input.studentName),
    courseOrClass: cleanText(input.courseOrClass),
    studentPhone,
    parentName: cleanText(input.parentName),
    parentRelation: cleanText(input.parentRelation),
    parentPhone,
    address: cleanText(input.address),
    notes: cleanText(input.notes),
    updatedAt: serverTimestamp()
  };
  await withTimeout(updateDoc(ref, payload), 12000, "student-update-timeout");
  return { studentId, ...payload, updatedAt: new Date() };
}

export async function setStudentAccountStatus(studentIdValue, statusValue, instituteCodeValue) {
  const studentId = normalizeCode(studentIdValue);
  const instituteCode = normalizeCode(instituteCodeValue);
  const status = statusValue === "active" ? "active" : "inactive";
  const profileRef = doc(db, "students", studentId);
  const accessRef = doc(db, "studentAccess", studentId);
  const profileSnap = await withTimeout(getDoc(profileRef), 9000, "student-read-timeout");
  if (!profileSnap.exists() || normalizeCode(profileSnap.data().instituteCode) !== instituteCode) {
    throw Object.assign(new Error("Student not found"), { code: "student-not-found" });
  }
  const batch = writeBatch(db);
  batch.update(profileRef, { accountStatus: status, status, updatedAt: serverTimestamp() });
  batch.update(accessRef, { accountStatus: status, updatedAt: serverTimestamp() });
  await withTimeout(batch.commit(), 12000, "student-status-timeout");
  return status;
}



export function generateSixDigitStudentPassword() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function resetStudentPassword(studentIdValue, instituteCodeValue) {
  const studentId = normalizeCode(studentIdValue);
  const instituteCode = normalizeCode(instituteCodeValue);
  const accessRef = doc(db, "studentAccess", studentId);
  const accessSnap = await withTimeout(getDoc(accessRef), 9000, "student-read-timeout");
  if (!accessSnap.exists() || normalizeCode(accessSnap.data().instituteCode) !== instituteCode) {
    throw Object.assign(new Error("Student not found"), { code: "student-not-found" });
  }
  const temporaryPassword = generateSixDigitStudentPassword();
  const passwordHash = await sha256(`${studentId}:${temporaryPassword}`);
  await withTimeout(updateDoc(accessRef, { passwordHash, mustChangePassword: true, accountStatus: "active", updatedAt: serverTimestamp() }), 12000, "student-password-reset-timeout");
  return temporaryPassword;
}

export async function archiveStudentProfile(studentIdValue, instituteCodeValue) {
  const studentId = normalizeCode(studentIdValue);
  const instituteCode = normalizeCode(instituteCodeValue);
  const profileRef = doc(db, "students", studentId);
  const accessRef = doc(db, "studentAccess", studentId);
  const profileSnap = await withTimeout(getDoc(profileRef), 9000, "student-read-timeout");
  if (!profileSnap.exists() || normalizeCode(profileSnap.data().instituteCode) !== instituteCode) {
    throw Object.assign(new Error("Student not found"), { code: "student-not-found" });
  }
  const batch = writeBatch(db);
  batch.update(profileRef, { accountStatus: "archived", status: "archived", isArchived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.update(accessRef, { accountStatus: "archived", updatedAt: serverTimestamp() });
  await withTimeout(batch.commit(), 12000, "student-archive-timeout");
  return true;
}

// V3.1 Room & Bed Management
export async function listInstituteRooms(instituteCodeValue) {
  const instituteCode = normalizeCode(instituteCodeValue);
  if (!instituteCode) throw Object.assign(new Error("Institute code missing"), { code: "institute-session-missing" });
  const q = query(collection(db, "rooms"), where("instituteCode", "==", instituteCode), limit(500));
  const snap = await withTimeout(getDocs(q), 12000, "room-list-timeout");
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(r => !r.isDeleted)
    .sort((a,b) => `${a.building||""}-${a.floor||""}-${a.roomNumber||""}`.localeCompare(`${b.building||""}-${b.floor||""}-${b.roomNumber||""}`));
}

export async function createRoom(input, instituteSession) {
  const instituteCode = normalizeCode(instituteSession?.instituteCode);
  const instituteId = cleanText(instituteSession?.instituteId);
  const roomNumber = cleanText(input.roomNumber).toUpperCase();
  const capacity = Number(input.capacity || 0);
  if (!instituteCode || !instituteId || !roomNumber || capacity < 1 || capacity > 50) {
    throw Object.assign(new Error("Invalid room details"), { code: "invalid-room-details" });
  }
  const roomId = `${instituteCode}-${roomNumber}`.replace(/[^A-Z0-9-]/g, "");
  const ref = doc(db, "rooms", roomId);
  const existing = await withTimeout(getDoc(ref), 9000, "room-read-timeout");
  if (existing.exists()) throw Object.assign(new Error("Room already exists"), { code: "room-exists" });
  const beds = Array.from({length: capacity}, (_,i) => ({ bedNumber: String(i+1), status: "vacant", studentId: "", studentName: "" }));
  const payload = {
    roomId, instituteId, instituteCode, instituteName: cleanText(instituteSession.instituteName),
    building: cleanText(input.building) || "Main Building", floor: cleanText(input.floor) || "Ground Floor",
    roomNumber, roomType: cleanText(input.roomType) || "Non-AC", capacity, occupiedBeds: 0,
    beds, status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  await withTimeout(setDoc(ref, payload), 12000, "room-create-timeout");
  return { ...payload, createdAt: new Date(), updatedAt: new Date() };
}

export async function allotStudentBed({ studentIdValue, roomIdValue, bedNumberValue, instituteCodeValue }) {
  const studentId = normalizeCode(studentIdValue);
  const roomId = cleanText(roomIdValue);
  const bedNumber = cleanText(bedNumberValue);
  const instituteCode = normalizeCode(instituteCodeValue);
  if (!studentId || !roomId || !bedNumber || !instituteCode) throw Object.assign(new Error("Allotment details missing"), { code: "allotment-details-missing" });
  return withTimeout(runTransaction(db, async tx => {
    const studentRef = doc(db, "students", studentId);
    const roomRef = doc(db, "rooms", roomId);
    const [studentSnap, roomSnap] = await Promise.all([tx.get(studentRef), tx.get(roomRef)]);
    if (!studentSnap.exists() || normalizeCode(studentSnap.data().instituteCode) !== instituteCode) throw Object.assign(new Error("Student not found"), { code: "student-not-found" });
    if (!roomSnap.exists() || normalizeCode(roomSnap.data().instituteCode) !== instituteCode) throw Object.assign(new Error("Room not found"), { code: "room-not-found" });
    const room = roomSnap.data();
    const beds = Array.isArray(room.beds) ? room.beds.map(b => ({ ...b })) : [];
    const target = beds.find(b => String(b.bedNumber) === bedNumber);
    if (!target) throw Object.assign(new Error("Bed not found"), { code: "bed-not-found" });
    if (target.status !== "vacant" || target.isVisible === false) throw Object.assign(new Error("Bed unavailable"), { code: "bed-unavailable" });
    if (studentSnap.data().roomId && studentSnap.data().roomId !== roomId) throw Object.assign(new Error("Vacate current bed before transfer"), { code: "existing-bed-allotment" });
    target.status = "occupied"; target.studentId = studentId; target.studentName = cleanText(studentSnap.data().studentName);
    const occupiedBeds = beds.filter(b => b.status === "occupied").length;
    tx.update(roomRef, { beds, occupiedBeds, updatedAt: serverTimestamp() });
    tx.update(studentRef, { roomId, roomNumber: room.roomNumber, building: room.building, floor: room.floor, bedNumber, roomStatus: "allotted", updatedAt: serverTimestamp() });
    tx.set(doc(db, "roomAllotments", studentId), { studentId, instituteCode, roomId, roomNumber: room.roomNumber, bedNumber, status: "active", updatedAt: serverTimestamp() }, { merge: true });
    return { roomId, roomNumber: room.roomNumber, bedNumber };
  }), 15000, "bed-allotment-timeout");
}

export async function setBedDisplayStatus({ roomIdValue, bedNumberValue, action, instituteCodeValue }) {
  const roomId=cleanText(roomIdValue), bedNumber=cleanText(bedNumberValue), instituteCode=normalizeCode(instituteCodeValue);
  const allowed=["hidden","maintenance","reserved","vacant"];
  if(!roomId||!bedNumber||!instituteCode||!allowed.includes(action)) throw Object.assign(new Error("Invalid bed action"),{code:"invalid-bed-action"});
  const roomRef=doc(db,"rooms",roomId), snap=await withTimeout(getDoc(roomRef),9000,"room-read-timeout");
  if(!snap.exists()||normalizeCode(snap.data().instituteCode)!==instituteCode) throw Object.assign(new Error("Room not found"),{code:"room-not-found"});
  const room=snap.data(), beds=Array.isArray(room.beds)?room.beds.map(b=>({...b})):[], target=beds.find(b=>String(b.bedNumber)===bedNumber);
  if(!target) throw Object.assign(new Error("Bed not found"),{code:"bed-not-found"});
  if(target.status==="occupied"&&action!=="vacant") throw Object.assign(new Error("Occupied bed cannot be hidden or reserved"),{code:"occupied-bed-locked"});
  if(target.status==="occupied"&&action==="vacant") throw Object.assign(new Error("Vacate the student first"),{code:"vacate-student-first"});
  target.status=action; target.isVisible=action!=="hidden"; target.studentId=""; target.studentName="";
  const occupiedBeds=beds.filter(b=>b.status==="occupied").length;
  await withTimeout(updateDoc(roomRef,{beds,occupiedBeds,updatedAt:serverTimestamp()}),12000,"bed-status-timeout");
  return {roomId,bedNumber,status:action};
}

export async function vacateStudentBed(studentIdValue, instituteCodeValue) {
  const studentId=normalizeCode(studentIdValue), instituteCode=normalizeCode(instituteCodeValue);
  const studentRef=doc(db,"students",studentId);
  const studentSnap=await withTimeout(getDoc(studentRef),9000,"student-read-timeout");
  if(!studentSnap.exists()||normalizeCode(studentSnap.data().instituteCode)!==instituteCode) throw Object.assign(new Error("Student not found"),{code:"student-not-found"});
  const s=studentSnap.data();
  const batch=writeBatch(db);
  if(s.roomId){
    const roomRef=doc(db,"rooms",s.roomId), roomSnap=await withTimeout(getDoc(roomRef),9000,"room-read-timeout");
    if(roomSnap.exists()){
      const beds=(roomSnap.data().beds||[]).map(b=>b.studentId===studentId?{...b,status:"vacant",studentId:"",studentName:""}:b);
      batch.update(roomRef,{beds,occupiedBeds:beds.filter(b=>b.status==="occupied").length,updatedAt:serverTimestamp()});
    }
  }
  batch.update(studentRef,{roomId:"",roomNumber:"",building:"",floor:"",bedNumber:"",roomStatus:"not-allotted",updatedAt:serverTimestamp()});
  batch.set(doc(db,"roomAllotments",studentId),{studentId,instituteCode,status:"vacated",updatedAt:serverTimestamp()},{merge:true});
  await withTimeout(batch.commit(),12000,"bed-vacate-timeout");
  return true;
}


// V3.2 Fees Management
export async function listInstituteFees(instituteCodeValue){
  const instituteCode=normalizeCode(instituteCodeValue);
  const q=query(collection(db,"fees"),where("instituteCode","==",instituteCode),limit(500));
  const snap=await withTimeout(getDocs(q),12000,"fee-list-timeout");
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(f=>!f.isDeleted);
}
export async function saveStudentFeePlan({studentId,instituteCode,totalFee,dueDate}){
  studentId=normalizeCode(studentId);instituteCode=normalizeCode(instituteCode);totalFee=Number(totalFee||0);
  if(!studentId||!instituteCode||totalFee<0) throw Object.assign(new Error("Invalid fee plan"),{code:"invalid-fee-plan"});
  const ref=doc(db,"fees",studentId), snap=await withTimeout(getDoc(ref),9000,"fee-read-timeout");
  const paid=Number(snap.exists()?snap.data().paidAmount||0:0), balance=Math.max(0,totalFee-paid);
  await withTimeout(setDoc(ref,{studentId,instituteCode,totalFee,paidAmount:paid,balanceAmount:balance,dueDate:cleanText(dueDate),status:balance>0?"due":"paid",updatedAt:serverTimestamp(),...(snap.exists()?{}:{createdAt:serverTimestamp()})},{merge:true}),12000,"fee-save-timeout");
  await withTimeout(updateDoc(doc(db,"students",studentId),{feeTotal:totalFee,feePaid:paid,feeBalance:balance,feesStatus:balance>0?"due":"paid",updatedAt:serverTimestamp()}),12000,"student-fee-sync-timeout");
  return {studentId,totalFee,paidAmount:paid,balanceAmount:balance};
}
export async function recordStudentFeePayment({studentId,instituteCode,amount,mode,reference}){
  studentId=normalizeCode(studentId);instituteCode=normalizeCode(instituteCode);amount=Number(amount||0);
  if(!studentId||!instituteCode||amount<=0) throw Object.assign(new Error("Invalid payment"),{code:"invalid-payment"});
  const referenceKey=cleanText(reference).toUpperCase();
  if(referenceKey){
    const duplicate=await getDocs(query(collection(db,"payments"),where("instituteCode","==",instituteCode),where("referenceKey","==",referenceKey),limit(1)));
    if(!duplicate.empty) throw Object.assign(new Error("Duplicate payment reference"),{code:"duplicate-payment-reference"});
  }
  const paymentRef=doc(collection(db,"payments"));
  const receiptNo=`R${new Date().toISOString().slice(0,10).replaceAll("-","")}-${paymentRef.id.slice(0,6).toUpperCase()}`;
  return withTimeout(runTransaction(db,async tx=>{
    const feeRef=doc(db,"fees",studentId),studentRef=doc(db,"students",studentId);
    const [feeSnap,studentSnap]=await Promise.all([tx.get(feeRef),tx.get(studentRef)]);
    if(!feeSnap.exists()) throw Object.assign(new Error("Set fee plan first"),{code:"fee-plan-missing"});
    if(!studentSnap.exists()||normalizeCode(studentSnap.data().instituteCode)!==instituteCode) throw Object.assign(new Error("Student not found"),{code:"student-not-found"});
    const fee=feeSnap.data(),oldBalance=Number(fee.balanceAmount||0);
    if(amount>oldBalance) throw Object.assign(new Error("Payment exceeds balance"),{code:"payment-exceeds-balance"});
    const paidAmount=Number(fee.paidAmount||0)+amount,balanceAmount=Math.max(0,Number(fee.totalFee||0)-paidAmount);
    tx.update(feeRef,{paidAmount,balanceAmount,status:balanceAmount>0?"due":"paid",updatedAt:serverTimestamp()});
    tx.set(paymentRef,{paymentId:paymentRef.id,receiptNo,studentId,instituteCode,amount,mode:cleanText(mode)||"Cash",reference:cleanText(reference),referenceKey,paidAt:serverTimestamp(),createdAt:serverTimestamp()});
    tx.update(studentRef,{feePaid:paidAmount,feeBalance:balanceAmount,feesStatus:balanceAmount>0?"due":"paid",updatedAt:serverTimestamp()});
    return {paymentId:paymentRef.id,receiptNo,amount,mode:cleanText(mode)||"Cash",balanceAmount};
  }),15000,"payment-save-timeout");
}
export async function listStudentPayments(studentIdValue){
  const studentId=normalizeCode(studentIdValue);
  const q=query(collection(db,"payments"),where("studentId","==",studentId),limit(250));
  const snap=await withTimeout(getDocs(q),12000,"payment-list-timeout");
  return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
}


// V3.3 Admission Payment + Bed Approval
export async function submitPendingAdmission(input, instituteSession) {
  const instituteCode = normalizeCode(instituteSession?.instituteCode);
  const instituteId = cleanText(instituteSession?.instituteId);
  if (!instituteCode || !instituteId) throw Object.assign(new Error("Institute session missing"), {code:"institute-session-missing"});
  const amountPayingNow = Number(input.amountPayingNow||0);
  const totalFees = Number(input.totalFees||0);
  if (!cleanText(input.studentName) || !cleanText(input.parentName) || !/^\d{10}$/.test(cleanText(input.studentPhone).replace(/\D/g,"")) || !/^\d{10}$/.test(cleanText(input.parentPhone).replace(/\D/g,"")) || totalFees < 0 || amountPayingNow <= 0 || amountPayingNow > totalFees) throw Object.assign(new Error("Invalid admission details"), {code:"invalid-admission-details"});
  if (!input.roomId || !input.bedNumber) throw Object.assign(new Error("Select a bed"), {code:"bed-required"});
  if (!cleanText(input.upiTransactionId)) throw Object.assign(new Error("UPI transaction ID required"), {code:"transaction-required"});
  const roomRef=doc(db,"rooms",cleanText(input.roomId));
  const roomSnap=await getDoc(roomRef);
  if(!roomSnap.exists()) throw Object.assign(new Error("Room not found"),{code:"room-not-found"});
  const room=roomSnap.data();
  const beds=(room.beds||[]).map(b=>({...b}));
  const bed=beds.find(b=>String(b.bedNumber)===String(input.bedNumber));
  if(!bed || bed.status!=="vacant" || bed.isVisible===false) throw Object.assign(new Error("Bed unavailable"),{code:"bed-unavailable"});
  const applicationId=`PA-${instituteCode}-${Date.now().toString(36).toUpperCase()}`;
  bed.status="reserved"; bed.pendingAdmissionId=applicationId; bed.studentName=cleanText(input.studentName);
  const data={...input,applicationId,instituteId,instituteCode,instituteName:cleanText(instituteSession.instituteName),roomNumber:room.roomNumber,floor:room.floor,building:room.building,totalFees,amountPayingNow,balanceAmount:Math.max(0,totalFees-amountPayingNow),status:"pending_payment_verification",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  const batch=writeBatch(db);
  batch.set(doc(db,"pendingAdmissions",applicationId),data);
  batch.update(roomRef,{beds,updatedAt:serverTimestamp()});
  await withTimeout(batch.commit(),15000,"pending-admission-timeout");
  return {...data,createdAt:new Date(),updatedAt:new Date()};
}

export async function listPendingAdmissions(instituteCodeValue){
  const instituteCode=normalizeCode(instituteCodeValue);
  const q=query(collection(db,"pendingAdmissions"),where("instituteCode","==",instituteCode),limit(250));
  const snap=await withTimeout(getDocs(q),12000,"pending-list-timeout");
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==="pending_payment_verification");
}

export async function approvePendingAdmission(applicationId,instituteSession){
  const ref=doc(db,"pendingAdmissions",applicationId), snap=await getDoc(ref);
  if(!snap.exists()) throw Object.assign(new Error("Application not found"),{code:"application-not-found"});
  const a=snap.data();
  const studentId=normalizeCode(a.studentId||generateStudentId(a.instituteCode));
  const password=generateSixDigitStudentPassword();
  const passwordHash=await sha256(`${studentId}:${password}`);
  const roomRef=doc(db,"rooms",a.roomId), roomSnap=await getDoc(roomRef);
  if(!roomSnap.exists()) throw Object.assign(new Error("Room not found"),{code:"room-not-found"});
  const room=roomSnap.data(), beds=(room.beds||[]).map(b=>({...b}));
  const bed=beds.find(b=>String(b.bedNumber)===String(a.bedNumber));
  if(!bed || bed.pendingAdmissionId!==applicationId) throw Object.assign(new Error("Reserved bed changed"),{code:"bed-reservation-lost"});
  bed.status="occupied"; bed.studentId=studentId; bed.studentName=a.studentName; delete bed.pendingAdmissionId;
  const common={...a,studentId,admissionId:`AD-${applicationId}`,status:"active",accountStatus:"active",roomStatus:"allotted",feesStatus:a.balanceAmount>0?"due":"paid",feeTotal:a.totalFees,feePaid:a.amountPayingNow,feeBalance:a.balanceAmount,approvedAt:serverTimestamp(),updatedAt:serverTimestamp()};
  const paymentRef=doc(collection(db,"payments"));
  const receiptNo=`R${new Date().toISOString().slice(0,10).replaceAll("-","")}-${paymentRef.id.slice(0,6).toUpperCase()}`;
  const batch=writeBatch(db);
  batch.set(doc(db,"admissions",common.admissionId),{...common,studentAccountCreated:true,createdAt:serverTimestamp()});
  batch.set(doc(db,"students",studentId),common);
  batch.set(doc(db,"studentAccess",studentId),{studentId,instituteId:a.instituteId,instituteCode:a.instituteCode,studentName:a.studentName,passwordHash,mustChangePassword:true,accountStatus:"active",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  batch.set(doc(db,"fees",studentId),{studentId,instituteCode:a.instituteCode,totalFee:a.totalFees,paidAmount:a.amountPayingNow,balanceAmount:a.balanceAmount,status:a.balanceAmount>0?"due":"paid",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  batch.set(paymentRef,{paymentId:paymentRef.id,receiptNo,studentId,instituteCode:a.instituteCode,amount:a.amountPayingNow,mode:"UPI",reference:a.upiTransactionId,paidAt:serverTimestamp(),createdAt:serverTimestamp()});
  batch.update(roomRef,{beds,occupiedBeds:beds.filter(b=>b.status==="occupied").length,updatedAt:serverTimestamp()});
  batch.update(ref,{status:"approved",studentId,temporaryPassword:password,receiptNo,approvedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  batch.update(doc(db,"institutes",a.instituteId),{currentStudents:Number(instituteSession.currentStudents||0)+1,updatedAt:serverTimestamp()});
  await withTimeout(batch.commit(),15000,"approval-timeout");
  return {...common,temporaryPassword:password,receiptNo};
}

export async function rejectPendingAdmission(applicationId,reason="Payment not verified") {
  const ref=doc(db,"pendingAdmissions",applicationId), snap=await getDoc(ref);
  if(!snap.exists()) return true; const a=snap.data();
  const roomRef=doc(db,"rooms",a.roomId), roomSnap=await getDoc(roomRef);
  const batch=writeBatch(db);
  if(roomSnap.exists()){const beds=(roomSnap.data().beds||[]).map(b=>b.pendingAdmissionId===applicationId?{...b,status:"vacant",pendingAdmissionId:"",studentName:""}:b);batch.update(roomRef,{beds,updatedAt:serverTimestamp()});}
  batch.update(ref,{status:"rejected",rejectionReason:reason,updatedAt:serverTimestamp()});
  await batch.commit(); return true;
}


// V3.5 Kitchen, Attendance, Movement, Complaints and Student Payments
function todayKey(value){ return cleanText(value) || new Date().toISOString().slice(0,10); }
export async function saveDailyMenu(input){
  const instituteCode=normalizeCode(input.instituteCode), date=todayKey(input.date);
  if(!instituteCode) throw Object.assign(new Error("Institute code missing"),{code:"institute-session-missing"});
  const id=`${instituteCode}-${date}`;
  const payload={id,instituteCode,instituteId:cleanText(input.instituteId),date,breakfast:cleanText(input.breakfast),lunch:cleanText(input.lunch),dinner:cleanText(input.dinner),snacks:cleanText(input.snacks),updatedAt:serverTimestamp()};
  await setDoc(doc(db,"dailyMenus",id),payload,{merge:true});return payload;
}
export async function getDailyMenu(instituteCodeValue,dateValue){const instituteCode=normalizeCode(instituteCodeValue),date=todayKey(dateValue);const snap=await getDoc(doc(db,"dailyMenus",`${instituteCode}-${date}`));return snap.exists()?{id:snap.id,...snap.data()}:null;}
export async function submitMealAttendance(input){const studentId=normalizeCode(input.studentId),instituteCode=normalizeCode(input.instituteCode),meal=cleanText(input.meal).toLowerCase(),date=todayKey(input.date);if(!studentId||!instituteCode||!["breakfast","lunch","dinner","night"].includes(meal))throw Object.assign(new Error("Invalid attendance"),{code:"invalid-attendance"});const id=`${studentId}-${date}-${meal}`;const ref=doc(db,"mealAttendance",id);if((await getDoc(ref)).exists())return true;await setDoc(ref,{id,studentId,studentName:cleanText(input.studentName),instituteCode,date,meal,status:"present",createdAt:serverTimestamp()});return true;}
export async function getStudentMealAttendance(studentIdValue,dateValue,mealValue){const id=`${normalizeCode(studentIdValue)}-${todayKey(dateValue)}-${cleanText(mealValue).toLowerCase()}`;const snap=await getDoc(doc(db,"mealAttendance",id));return snap.exists()?{id:snap.id,...snap.data()}:null;}
export async function listInstituteMealAttendance(instituteCodeValue,dateValue){const code=normalizeCode(instituteCodeValue),date=todayKey(dateValue),q=query(collection(db,"mealAttendance"),where("instituteCode","==",code),limit(1000)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.date===date);}
export async function submitMovementRequest(input){const studentId=normalizeCode(input.studentId),instituteCode=normalizeCode(input.instituteCode);if(!studentId||!instituteCode||!cleanText(input.reason)||!cleanText(input.location))throw Object.assign(new Error("Invalid movement"),{code:"invalid-movement"});const ref=doc(collection(db,"movements"));const data={id:ref.id,studentId,studentName:cleanText(input.studentName),instituteCode,reason:cleanText(input.reason),location:cleanText(input.location),leavingDate:cleanText(input.leavingDate),leavingTime:cleanText(input.leavingTime),returnDate:cleanText(input.returnDate),returnTime:cleanText(input.returnTime),status:"outside",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await setDoc(ref,data);return data;}
export async function markStudentEntry(movementId){await updateDoc(doc(db,"movements",cleanText(movementId)),{status:"returned",actualReturnAt:serverTimestamp(),updatedAt:serverTimestamp()});return true;}
export async function listInstituteMovements(instituteCodeValue){const code=normalizeCode(instituteCodeValue),q=query(collection(db,"movements"),where("instituteCode","==",code),limit(500)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function getStudentMovements(studentIdValue){const id=normalizeCode(studentIdValue),q=query(collection(db,"movements"),where("studentId","==",id),limit(250)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function submitComplaint(input){const studentId=normalizeCode(input.studentId),instituteCode=normalizeCode(input.instituteCode);if(!studentId||!instituteCode||!cleanText(input.details))throw Object.assign(new Error("Invalid complaint"),{code:"invalid-complaint"});const ref=doc(collection(db,"complaints"));const data={id:ref.id,studentId,studentName:cleanText(input.studentName),instituteCode,category:cleanText(input.category)||"Other",subject:cleanText(input.subject)||"Complaint",details:cleanText(input.details),status:"submitted",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await setDoc(ref,data);return data;}
export async function listStudentComplaints(studentIdValue){const id=normalizeCode(studentIdValue),q=query(collection(db,"complaints"),where("studentId","==",id),limit(250)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function listInstituteComplaints(instituteCodeValue){const code=normalizeCode(instituteCodeValue),q=query(collection(db,"complaints"),where("instituteCode","==",code),limit(500)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function updateComplaintStatus(complaintId,status){await updateDoc(doc(db,"complaints",cleanText(complaintId)),{status:cleanText(status),updatedAt:serverTimestamp()});return true;}
export async function submitStudentFeePaymentRequest(input){const studentId=normalizeCode(input.studentId),instituteCode=normalizeCode(input.instituteCode),amount=Number(input.amount||0),reference=cleanText(input.reference);if(!studentId||!instituteCode||amount<=0||!reference)throw Object.assign(new Error("Invalid payment request"),{code:"invalid-payment-request"});const ref=doc(collection(db,"payments"));const data={paymentId:ref.id,studentId,studentName:cleanText(input.studentName),instituteCode,amount,mode:"UPI",reference,status:"pending_verification",createdAt:serverTimestamp(),paidAt:serverTimestamp()};await setDoc(ref,data);return data;}


// V3.6 Institute dashboard branding
export async function saveAdmissionFeeSettings(input){
  const instituteCode=normalizeCode(input.instituteCode);
  if(!instituteCode)throw Object.assign(new Error("Institute code missing"),{code:"institute-session-missing"});
  const data={instituteCode,instituteId:cleanText(input.instituteId),upiId:cleanText(input.upiId),defaultTotalFees:Number(input.defaultTotalFees||0),shareInstituteId:cleanText(input.shareInstituteId)||instituteCode,shareInstitutePassword:String(input.shareInstitutePassword||""),updatedAt:serverTimestamp()};
  await setDoc(doc(db,"instituteBranding",instituteCode),data,{merge:true});
  await setDoc(doc(db,"instituteAccess",instituteCode),{upiId:data.upiId,defaultTotalFees:data.defaultTotalFees,shareInstituteId:data.shareInstituteId,shareInstitutePassword:data.shareInstitutePassword,updatedAt:serverTimestamp()},{merge:true});
  return {...data,updatedAt:new Date()};
}

export async function getInstituteBranding(instituteCodeValue){
  const instituteCode=normalizeCode(instituteCodeValue);
  if(!instituteCode)return null;
  const snap=await getDoc(doc(db,"instituteBranding",instituteCode));
  return snap.exists()?{id:snap.id,...snap.data()}:null;
}
export async function saveInstituteBranding(input){
  const instituteCode=normalizeCode(input.instituteCode);
  if(!instituteCode||!cleanText(input.instituteName))throw Object.assign(new Error("Invalid branding"),{code:"invalid-branding"});
  const data={instituteCode,instituteId:cleanText(input.instituteId),instituteName:cleanText(input.instituteName),shortName:cleanText(input.shortName),logoUrl:cleanText(input.logoUrl),primaryColor:cleanText(input.primaryColor)||"#0b4f8a",secondaryColor:cleanText(input.secondaryColor)||"#16866b",contactNumber:cleanText(input.contactNumber).replace(/\D/g,""),upiId:cleanText(input.upiId),defaultTotalFees:Number(input.defaultTotalFees||0),welcomeMessage:cleanText(input.welcomeMessage),updatedAt:serverTimestamp()};
  await setDoc(doc(db,"instituteBranding",instituteCode),data,{merge:true});
  await setDoc(doc(db,"instituteAccess",instituteCode),{instituteName:data.instituteName,upiId:data.upiId,updatedAt:serverTimestamp()},{merge:true});
  return {...data,updatedAt:new Date()};
}


// V3.7 Approvals, Notifications and Data Safety
export async function createAuditLog(input){
  const ref=doc(collection(db,"auditLogs"));
  const data={id:ref.id,instituteCode:normalizeCode(input.instituteCode),actorType:cleanText(input.actorType)||"system",actorId:cleanText(input.actorId),action:cleanText(input.action),entityType:cleanText(input.entityType),entityId:cleanText(input.entityId),summary:cleanText(input.summary),oldValue:input.oldValue||null,newValue:input.newValue||null,userAgent:navigator.userAgent||"",createdAt:serverTimestamp()};
  await setDoc(ref,data); return data;
}
export async function listAuditLogs(instituteCodeValue){const code=normalizeCode(instituteCodeValue),q=query(collection(db,"auditLogs"),where("instituteCode","==",code),limit(500)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function createNotification(input){const ref=doc(collection(db,"notifications"));const data={id:ref.id,instituteCode:normalizeCode(input.instituteCode),recipientType:cleanText(input.recipientType)||"admin",recipientId:normalizeCode(input.recipientId),title:cleanText(input.title),message:cleanText(input.message),type:cleanText(input.type)||"info",relatedType:cleanText(input.relatedType),relatedId:cleanText(input.relatedId),isRead:false,createdAt:serverTimestamp()};await setDoc(ref,data);return data;}
export async function listNotifications({instituteCode,recipientType,recipientId=""}){const code=normalizeCode(instituteCode),rid=normalizeCode(recipientId),q=query(collection(db,"notifications"),where("instituteCode","==",code),limit(500)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.recipientType===recipientType&&(!rid||normalizeCode(x.recipientId)===rid)).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function markNotificationRead(id){await updateDoc(doc(db,"notifications",cleanText(id)),{isRead:true,readAt:serverTimestamp()});return true;}
export async function createApprovalRequest(input){const ref=doc(collection(db,"approvalRequests"));const data={id:ref.id,instituteCode:normalizeCode(input.instituteCode),requestType:cleanText(input.requestType),requestedByType:cleanText(input.requestedByType)||"resident",requestedById:normalizeCode(input.requestedById),requestedByName:cleanText(input.requestedByName),relatedId:cleanText(input.relatedId),title:cleanText(input.title),details:input.details||{},status:"pending",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await setDoc(ref,data);await createNotification({instituteCode:data.instituteCode,recipientType:"admin",title:`Pending ${data.title||data.requestType}`,message:`${data.requestedByName||data.requestedById} submitted a request.`,type:"approval",relatedType:"approval",relatedId:ref.id});await createAuditLog({instituteCode:data.instituteCode,actorType:data.requestedByType,actorId:data.requestedById,action:"approval_requested",entityType:data.requestType,entityId:data.relatedId,summary:data.title});return data;}
export async function listApprovalRequests(instituteCodeValue,statusValue="pending"){const code=normalizeCode(instituteCodeValue),q=query(collection(db,"approvalRequests"),where("instituteCode","==",code),limit(500)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!statusValue||x.status===statusValue).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));}
export async function decideApprovalRequest(id,status,note=""){const ref=doc(db,"approvalRequests",cleanText(id)),snap=await getDoc(ref);if(!snap.exists())throw Object.assign(new Error("Approval not found"),{code:"approval-not-found"});const a=snap.data();const finalStatus=status==="approved"?"approved":"rejected";await updateDoc(ref,{status:finalStatus,decisionNote:cleanText(note),decidedAt:serverTimestamp(),updatedAt:serverTimestamp()});if(a.requestedById)await createNotification({instituteCode:a.instituteCode,recipientType:"resident",recipientId:a.requestedById,title:`Request ${finalStatus}`,message:`${a.title||a.requestType} was ${finalStatus}.${note?` ${note}`:""}`,type:finalStatus,relatedType:a.requestType,relatedId:a.relatedId});await createAuditLog({instituteCode:a.instituteCode,actorType:"admin",action:`approval_${finalStatus}`,entityType:a.requestType,entityId:a.relatedId,summary:a.title,newValue:{status:finalStatus,note}});return finalStatus;}
export async function softDeleteRecord({collectionName,recordId,instituteCode,deletedBy,reason}){const ref=doc(db,cleanText(collectionName),cleanText(recordId)),snap=await getDoc(ref);if(!snap.exists())throw Object.assign(new Error("Record not found"),{code:"not-found"});await updateDoc(ref,{isDeleted:true,deletedAt:serverTimestamp(),deletedBy:cleanText(deletedBy),deleteReason:cleanText(reason),previousStatus:snap.data().status||"",status:"deleted",updatedAt:serverTimestamp()});await setDoc(doc(db,"deletedRecords",`${cleanText(collectionName)}__${cleanText(recordId)}`),{id:`${cleanText(collectionName)}__${cleanText(recordId)}`,collectionName:cleanText(collectionName),recordId:cleanText(recordId),instituteCode:normalizeCode(instituteCode),displayName:cleanText(snap.data().studentName||snap.data().instituteName||snap.data().roomNumber||snap.data().subject||recordId),deletedBy:cleanText(deletedBy),deleteReason:cleanText(reason),deletedAt:serverTimestamp(),status:"deleted"},{merge:true});await createAuditLog({instituteCode,actorType:"admin",actorId:deletedBy,action:"soft_delete",entityType:collectionName,entityId:recordId,summary:reason});return true;}
export async function listRecycleBin(instituteCodeValue){const code=normalizeCode(instituteCodeValue),q=query(collection(db,"deletedRecords"),where("instituteCode","==",code),limit(500)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==="deleted");}
export async function restoreDeletedRecord(item){const ref=doc(db,item.collectionName,item.recordId);await updateDoc(ref,{isDeleted:false,status:item.previousStatus||"active",restoredAt:serverTimestamp(),updatedAt:serverTimestamp()});await updateDoc(doc(db,"deletedRecords",item.id),{status:"restored",restoredAt:serverTimestamp()});await createAuditLog({instituteCode:item.instituteCode,actorType:"admin",action:"restore",entityType:item.collectionName,entityId:item.recordId,summary:"Record restored from recycle bin"});return true;}
export async function createBackupSnapshot(instituteCodeValue){const code=normalizeCode(instituteCodeValue);const names=["students","pendingAdmissions","rooms","fees","payments","dailyMenus","mealAttendance","movements","complaints","approvalRequests","notifications","auditLogs"];const counts={};for(const name of names){const q=query(collection(db,name),where("instituteCode","==",code),limit(5000));const snap=await getDocs(q);counts[name]=snap.size;}const id=`${code}-${new Date().toISOString().slice(0,10)}`;const data={id,instituteCode:code,backupDate:new Date().toISOString().slice(0,10),recordCounts:counts,status:"snapshot_complete",note:"Metadata snapshot created. Full Firestore export requires a scheduled Cloud Function.",createdAt:serverTimestamp()};await setDoc(doc(db,"backupJobs",id),data,{merge:true});await createAuditLog({instituteCode:code,actorType:"admin",action:"backup_snapshot",entityType:"backupJobs",entityId:id,summary:"Daily backup metadata snapshot created"});return data;}
export async function listBackupSnapshots(instituteCodeValue){const code=normalizeCode(instituteCodeValue),q=query(collection(db,"backupJobs"),where("instituteCode","==",code),limit(100)),snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.backupDate||"").localeCompare(String(a.backupDate||"")));}
export async function findDuplicateAdmissions(input){const code=normalizeCode(input.instituteCode),phone=cleanText(input.studentPhone).replace(/\D/g,""),parent=cleanText(input.parentPhone).replace(/\D/g,""),name=cleanText(input.studentName).toLowerCase(),dob=cleanText(input.dateOfBirth),aadhaar=cleanText(input.aadhaarLast4);const q=query(collection(db,"students"),where("instituteCode","==",code),limit(1000));const snap=await getDocs(q);return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!x.isDeleted&&((phone&&cleanText(x.studentPhone)===phone)||(name&&parent&&cleanText(x.studentName).toLowerCase()===name&&cleanText(x.parentPhone)===parent)||(dob&&aadhaar&&cleanText(x.dateOfBirth)===dob&&cleanText(x.aadhaarLast4)===aadhaar)));}



export async function getInstituteLiveMetrics(instituteCodeValue) {
  const instituteCode = normalizeCode(instituteCodeValue);
  if (!instituteCode) throw Object.assign(new Error("Institute code missing"), { code: "institute-session-missing" });
  const today = new Date().toISOString().slice(0, 10);
  const countQuery = async (name, constraints = []) => {
    const ref = query(collection(db, name), where("instituteCode", "==", instituteCode), ...constraints);
    const snap = await getCountFromServer(ref);
    return Number(snap.data().count || 0);
  };
  const [residents, pendingAdmissions, openComplaints, outsideResidents, pendingApprovals, roomsSnap, feesSnap] = await Promise.all([
    countQuery("students", [where("accountStatus", "==", "active")]),
    countQuery("pendingAdmissions", [where("status", "==", "pending")]),
    countQuery("complaints", [where("status", "in", ["open", "in-review"])]).catch(() => countQuery("complaints")),
    countQuery("movements", [where("status", "==", "outside")]),
    countQuery("approvalRequests", [where("status", "==", "pending")]),
    getDocs(query(collection(db, "rooms"), where("instituteCode", "==", instituteCode), limit(1000))),
    getDocs(query(collection(db, "fees"), where("instituteCode", "==", instituteCode), limit(5000)))
  ]);
  let vacantBeds = 0, occupiedBeds = 0, maintenanceBeds = 0;
  roomsSnap.docs.forEach(d => (d.data().beds || []).forEach(b => {
    const status = b.isVisible === false ? "hidden" : (b.status || "vacant");
    if (status === "vacant") vacantBeds += 1;
    else if (status === "occupied") occupiedBeds += 1;
    else if (status === "maintenance") maintenanceBeds += 1;
  }));
  let feeDueToday = 0, pendingFees = 0, outstandingAmount = 0;
  feesSnap.docs.forEach(d => {
    const f = d.data(); const balance = Number(f.balanceAmount || 0);
    if (balance > 0) { pendingFees += 1; outstandingAmount += balance; }
    if (balance > 0 && String(f.dueDate || "") === today) feeDueToday += 1;
  });
  return { residents, pendingAdmissions, openComplaints, outsideResidents, pendingApprovals, vacantBeds, occupiedBeds, maintenanceBeds, feeDueToday, pendingFees, outstandingAmount, updatedAt: new Date().toISOString() };
}
export async function getSystemHealth() {
  const startedAt = performance.now();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  try {
    await withRetry(() => withTimeout(getDoc(doc(db, "systemHealth", "ping")), 5000, "health-timeout"), { attempts: 2, baseDelay: 250 });
    return { ok: true, online, latencyMs: Math.round(performance.now() - startedAt), checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error?.code === "permission-denied" || error?.code === "not-found") {
      return { ok: true, online, latencyMs: Math.round(performance.now() - startedAt), checkedAt: new Date().toISOString(), note: "Firebase reachable" };
    }
    return { ok: false, online, latencyMs: Math.round(performance.now() - startedAt), checkedAt: new Date().toISOString(), code: error?.code || "health-check-failed" };
  }
}


// V4.1 Institute Admin Login and Admission Status
export async function loginInstituteAdmin(instituteCodeValue, adminIdValue, passwordValue) {
  const instituteCode=normalizeCode(instituteCodeValue), adminId=cleanText(adminIdValue).toLowerCase(), password=String(passwordValue||"");
  if(!instituteCode||!adminId||!password) throw Object.assign(new Error("Missing admin credentials"),{code:"missing-admin-credentials"});
  const snap=await withTimeout(getDoc(doc(db,"instituteAccess",instituteCode)),9000,"admin-login-timeout");
  if(!snap.exists()) throw Object.assign(new Error("Institute not found"),{code:"institute-not-found"});
  const data=snap.data();
  if(!data.adminPasswordHash){if(adminId==="admin"&&password==="12345")return {adminId:"admin",isDefault:true};throw Object.assign(new Error("Invalid admin credentials"),{code:"invalid-admin-credential"});}
  const hash=await sha256(`${instituteCode}:admin:${adminId}:${password}`);
  if(adminId!==String(data.adminId||"").toLowerCase()||hash!==data.adminPasswordHash)throw Object.assign(new Error("Invalid admin credentials"),{code:"invalid-admin-credential"});
  return {adminId:data.adminId,isDefault:false};
}

export async function changeInstituteAdminCredentials(instituteCodeValue, adminIdValue, passwordValue){
 const instituteCode=normalizeCode(instituteCodeValue),adminId=cleanText(adminIdValue).toLowerCase(),password=String(passwordValue||"");
 if(!instituteCode||!adminId||password.length<5)throw Object.assign(new Error("Invalid admin credentials"),{code:"invalid-admin-credentials"});
 const adminPasswordHash=await sha256(`${instituteCode}:admin:${adminId}:${password}`);
 await withTimeout(updateDoc(doc(db,"instituteAccess",instituteCode),{adminId,adminPasswordHash,adminUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp()}),12000,"admin-credentials-timeout");
 return {adminId};
}

export async function checkAdmissionStatus(instituteCodeValue, phoneValue){
 const instituteCode=normalizeCode(instituteCodeValue),phone=cleanText(phoneValue).replace(/\D/g,"");
 if(!instituteCode||!/^\d{10}$/.test(phone))throw Object.assign(new Error("Invalid phone"),{code:"invalid-phone"});
 const q=query(collection(db,"pendingAdmissions"),where("studentPhone","==",phone),limit(20));
 const snap=await withTimeout(getDocs(q),12000,"admission-status-timeout");
 const rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>normalizeCode(x.instituteCode)===instituteCode).sort((a,b)=>(b.updatedAt?.seconds||b.createdAt?.seconds||0)-(a.updatedAt?.seconds||a.createdAt?.seconds||0));
 return rows[0]||null;
}
