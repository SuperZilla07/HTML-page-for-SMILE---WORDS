import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  getAuth
} from "firebase/auth";
import {
  child,
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  serverTimestamp,
  set,
  update
} from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

let app;
let auth;
let db;

if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  setPersistence(auth, browserLocalPersistence);
}

export { auth, db };

export function watchAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function signInEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerEmail(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
}

export async function signInGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser() {
  return signOut(auth);
}

export function emailKey(email) {
  return btoa(String(email).trim().toLowerCase()).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function upsertUserProfile(user) {
  if (!db || !user) return;
  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "VCMC user",
    photoURL: user.photoURL || "",
    lastSeen: serverTimestamp()
  };
  await update(ref(db, `users/${user.uid}`), profile);
  if (user.email) {
    await set(ref(db, `usersByEmail/${emailKey(user.email)}`), user.uid);
  }
}

export function watchGlobalMessages(callback) {
  const messagesRef = query(ref(db, "rooms/global/messages"), orderByChild("createdAt"), limitToLast(80));
  return onValue(messagesRef, (snapshot) => callback(snapshotToArray(snapshot)));
}

export function watchPrivateMessages(roomId, callback) {
  const messagesRef = query(ref(db, `privateRooms/${roomId}/messages`), orderByChild("createdAt"), limitToLast(80));
  return onValue(messagesRef, (snapshot) => callback(snapshotToArray(snapshot)));
}

export async function sendGlobalMessage(user, encodedWords) {
  return push(ref(db, "rooms/global/messages"), messagePayload(user, encodedWords));
}

export async function sendPrivateMessage(roomId, user, encodedWords) {
  return push(ref(db, `privateRooms/${roomId}/messages`), messagePayload(user, encodedWords));
}

export function watchContacts(uid, callback) {
  return onValue(ref(db, `contacts/${uid}`), async (snapshot) => {
    const contacts = [];
    const values = snapshot.val() || {};
    for (const [contactUid, data] of Object.entries(values)) {
      const profileSnap = await get(ref(db, `users/${contactUid}`));
      contacts.push({ uid: contactUid, ...(profileSnap.val() || {}), ...data });
    }
    callback(contacts.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")));
  });
}

export function watchIncomingRequests(uid, callback) {
  return onValue(ref(db, `friendRequests/${uid}`), async (snapshot) => {
    const requests = [];
    const values = snapshot.val() || {};
    for (const [fromUid, data] of Object.entries(values)) {
      const profileSnap = await get(ref(db, `users/${fromUid}`));
      requests.push({ fromUid, ...(profileSnap.val() || {}), ...data });
    }
    callback(requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  });
}

export async function requestContact(currentUser, friendEmail) {
  const lookup = await get(ref(db, `usersByEmail/${emailKey(friendEmail)}`));
  const friendUid = lookup.val();
  if (!friendUid) throw new Error("No user found with that email.");
  if (friendUid === currentUser.uid) throw new Error("You cannot add yourself.");

  await update(ref(db), {
    [`friendRequests/${friendUid}/${currentUser.uid}`]: {
      fromUid: currentUser.uid,
      fromEmail: currentUser.email || "",
      fromName: currentUser.displayName || currentUser.email || "VCMC user",
      createdAt: serverTimestamp()
    },
    [`contacts/${currentUser.uid}/${friendUid}`]: {
      status: "pending",
      createdAt: serverTimestamp()
    }
  });
}

export async function acceptContact(currentUser, fromUid) {
  const roomId = privateRoomId(currentUser.uid, fromUid);
  await update(ref(db), {
    [`contacts/${currentUser.uid}/${fromUid}`]: {
      status: "active",
      roomId,
      createdAt: serverTimestamp()
    },
    [`contacts/${fromUid}/${currentUser.uid}`]: {
      status: "active",
      roomId,
      createdAt: serverTimestamp()
    },
    [`privateRooms/${roomId}/members/${currentUser.uid}`]: true,
    [`privateRooms/${roomId}/members/${fromUid}`]: true,
    [`friendRequests/${currentUser.uid}/${fromUid}`]: null
  });
}

export function privateRoomId(uidA, uidB) {
  return [uidA, uidB].sort().join("__");
}

function messagePayload(user, encodedWords) {
  return {
    uid: user.uid,
    author: user.displayName || user.email?.split("@")[0] || "VCMC user",
    photoURL: user.photoURL || "",
    encodedWords,
    createdAt: serverTimestamp()
  };
}

function snapshotToArray(snapshot) {
  const out = [];
  snapshot.forEach((childSnapshot) => {
    out.push({ id: childSnapshot.key, ...childSnapshot.val() });
  });
  return out;
}
