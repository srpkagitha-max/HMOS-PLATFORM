import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

export async function loginSuperAdmin(email, password) {
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

export async function createInstitute(input, actorUid) {
  const record = {
    instituteCode: input.instituteCode.toUpperCase(),
    instituteName: input.instituteName,
    hostelType: input.hostelType,
    ownerName: input.ownerName,
    ownerPhone: input.ownerPhone,
    subscriptionPlan: "yearly",
    subscriptionStatus: "active",
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
    portalAccessStatus: "pendingServerSetup",
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    isArchived: false,
    version: 1
  };
  const ref = await addDoc(collection(db, "institutes"), record);
  return { id: ref.id, ...record };
}
