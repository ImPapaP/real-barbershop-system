// Real Firebase backend (used when firebase-config.js is filled in). Loads the Firebase web SDK from Google's CDN.
// db exposes a small chainable API: db.collection('x').where(...).onSnapshot(...), db.doc('x/y').set(...)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { firebaseConfig, FUNCTIONS_REGION } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const fs = getFirestore(app);
const fns = getFunctions(app, FUNCTIONS_REGION);
export const auth = getAuth(app);


const wrapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const wrapQuery = s => ({ docs: s.docs.map(wrapDoc), size: s.size, empty: s.empty, metadata: s.metadata });

function docRef(path) {
  const r = doc(fs, path);
  return {
    id: r.id, path,
    get: async () => wrapDoc(await getDoc(r)),
    set: data => setDoc(r, data),
    update: data => updateDoc(r, data),
    delete: () => deleteDoc(r),
    onSnapshot: (next, err) => onSnapshot(r, s => next(wrapDoc(s)), err)
  };
}
function queryRef(path, parts = []) {
  const make = () => parts.length ? query(collection(fs, path), ...parts) : collection(fs, path);
  return {
    path,
    where: (f, op, v) => queryRef(path, [...parts, where(f, op, v)]),
    orderBy: (f, dir) => queryRef(path, [...parts, orderBy(f, dir)]),
    limit: n => queryRef(path, [...parts, limit(n)]),
    doc: id => docRef(id ? `${path}/${id}` : doc(collection(fs, path)).path),
    get: async () => wrapQuery(await getDocs(make())),
    onSnapshot: (next, err) => onSnapshot(make(), s => next(wrapQuery(s)), err)
  };
}
export const db = { doc: docRef, collection: p => queryRef(p) };

export async function call(name, data) {
  try { return (await httpsCallable(fns, name)(data)).data; }
  catch (e) { const err = new Error(e.message || 'Something went wrong.'); err.code = (e.code || '').replace('functions/', ''); throw err; }
}
export const login = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
export const logout = () => signOut(auth);
export const resetPassword = email => sendPasswordResetEmail(auth, email);
export const onAuth = fn => onAuthStateChanged(auth, fn);
