// Data layer. Everything the screens read or write goes through here.
// When Firebase isn't configured yet, a local preview store with the starter
// recipes is used instead so the app can be looked at before setup.

import { db, auth, googleProvider, isConfigured, ADMIN_EMAIL } from "./firebase.js";
import seed from "./seedRecipes.json";
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc,
  serverTimestamp, arrayUnion, arrayRemove, query, orderBy, writeBatch, getDocs,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut } from "firebase/auth";

export const SEED = seed;
export const isPreview = !isConfigured;

// ─── Firebase implementation ────────────────────────────────────────────────

const live = {
  onAuth(cb) {
    return onAuthStateChanged(auth, cb);
  },
  async signIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, googleProvider);
      } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        throw e;
      }
    }
  },
  signOut() {
    return fbSignOut(auth);
  },
  async touchUser(user) {
    await setDoc(
      doc(db, "users", user.uid),
      { name: user.displayName || user.email, email: user.email || "", photo: user.photoURL || "", lastSeen: serverTimestamp() },
      { merge: true }
    );
  },
  onMe(uid, cb) {
    return onSnapshot(doc(db, "users", uid), (s) => cb(s.exists() ? s.data() : {}));
  },
  onRecipes(cb, onErr) {
    return onSnapshot(
      collection(db, "recipes"),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onErr
    );
  },
  async createRecipe(data, user) {
    const ref = await addDoc(collection(db, "recipes"), {
      ...data,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByName: user.displayName || user.email,
    });
    return ref.id;
  },
  async updateRecipe(id, data, user) {
    await updateDoc(doc(db, "recipes", id), {
      ...data,
      updatedAt: serverTimestamp(),
      updatedByName: user.displayName || user.email,
    });
  },
  deleteRecipe(id) {
    return deleteDoc(doc(db, "recipes", id));
  },
  onComments(recipeId, cb) {
    return onSnapshot(
      query(collection(db, "recipes", recipeId, "comments"), orderBy("createdAt", "asc")),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  },
  addComment(recipeId, text, user) {
    return addDoc(collection(db, "recipes", recipeId, "comments"), {
      text,
      uid: user.uid,
      name: user.displayName || user.email,
      createdAt: serverTimestamp(),
    });
  },
  deleteComment(recipeId, commentId) {
    return deleteDoc(doc(db, "recipes", recipeId, "comments", commentId));
  },
  setFavorite(uid, recipeId, on) {
    return setDoc(doc(db, "users", uid), { favorites: on ? arrayUnion(recipeId) : arrayRemove(recipeId) }, { merge: true });
  },
  onUsers(cb) {
    return onSnapshot(collection(db, "users"), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))));
  },
  setLinkedName(uid, name) {
    return setDoc(doc(db, "users", uid), { linkedName: name }, { merge: true });
  },
  // Adds any starter recipes that aren't in the database yet. Never overwrites.
  async importSeed() {
    const existing = new Set((await getDocs(collection(db, "recipes"))).docs.map((d) => d.id));
    const missing = seed.filter((r) => !existing.has(r.id));
    for (let i = 0; i < missing.length; i += 400) {
      const batch = writeBatch(db);
      missing.slice(i, i + 400).forEach(({ id, ...r }) => {
        batch.set(doc(db, "recipes", id), {
          ...r,
          ownerUid: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedByName: "Imported from the family workbook",
        });
      });
      await batch.commit();
    }
    return missing.length;
  },
};

// ─── Preview implementation (in memory, nothing is saved) ───────────────────

function makePreview() {
  const now = () => ({ toDate: () => new Date() });
  const state = {
    user: null,
    me: { favorites: [] },
    recipes: seed.map((r) => ({ ...r, ownerUid: null, updatedByName: "Imported from the family workbook" })),
    comments: {},
    users: [],
  };
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  const watch = (fn) => { subs.add(fn); fn(); return () => subs.delete(fn); };
  const previewUser = { uid: "preview", displayName: "Ted Deakin", email: ADMIN_EMAIL, photoURL: "" };
  let authCb = null;
  return {
    onAuth(cb) { authCb = cb; cb(state.user); return () => {}; },
    async signIn() { state.user = previewUser; state.users = [{ uid: "preview", name: "Ted Deakin", email: ADMIN_EMAIL, linkedName: "Ted" }]; state.me.linkedName = "Ted"; authCb && authCb(state.user); },
    async signOut() { state.user = null; authCb && authCb(null); },
    async touchUser() {},
    onMe(uid, cb) { return watch(() => cb({ ...state.me })); },
    onRecipes(cb) { return watch(() => cb([...state.recipes])); },
    async createRecipe(data, user) {
      const id = "new-" + Date.now();
      state.recipes.push({ id, ...data, ownerUid: user.uid, updatedByName: user.displayName });
      emit();
      return id;
    },
    async updateRecipe(id, data, user) {
      state.recipes = state.recipes.map((r) => (r.id === id ? { ...r, ...data, updatedByName: user.displayName } : r));
      emit();
    },
    async deleteRecipe(id) { state.recipes = state.recipes.filter((r) => r.id !== id); emit(); },
    onComments(rid, cb) { return watch(() => cb([...(state.comments[rid] || [])])); },
    async addComment(rid, text, user) {
      state.comments[rid] = [...(state.comments[rid] || []), { id: String(Date.now()), text, uid: user.uid, name: user.displayName, createdAt: now() }];
      emit();
    },
    async deleteComment(rid, cid) { state.comments[rid] = (state.comments[rid] || []).filter((c) => c.id !== cid); emit(); },
    async setFavorite(uid, rid, on) {
      const f = new Set(state.me.favorites || []);
      on ? f.add(rid) : f.delete(rid);
      state.me = { ...state.me, favorites: [...f] };
      emit();
    },
    onUsers(cb) { return watch(() => cb([...state.users])); },
    async setLinkedName(uid, name) {
      state.users = state.users.map((u) => (u.uid === uid ? { ...u, linkedName: name } : u));
      if (uid === "preview") state.me = { ...state.me, linkedName: name };
      emit();
    },
    async importSeed() { return 0; },
  };
}

export const store = isConfigured ? live : makePreview();
