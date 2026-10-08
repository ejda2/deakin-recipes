// Firebase connection for the Deakin Family Recipes app.
//
// Paste the firebaseConfig values from your Firebase project here
// (Firebase console > Project settings > Your apps > Web app > SDK setup and configuration).
// These values are not secret. Access is controlled by firestore.rules.

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCf5QZPQ2th9dSVyhftpNgcKya2qM2AJ1E",
  authDomain: "deakin-recipes.firebaseapp.com",
  projectId: "deakin-recipes",
  storageBucket: "deakin-recipes.firebasestorage.app",
  messagingSenderId: "734531811078",
  appId: "1:734531811078:web:05f66f9807aa4553255087"
};

export const isConfigured = !firebaseConfig.apiKey.startsWith("PASTE_");

const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// The administrator can edit or delete any recipe, link family members to
// contributor names, and import the starter recipes. Keep this in sync with
// the ADMIN_EMAIL in firestore.rules.
export const ADMIN_EMAIL = "joe.edwards.a2@gmail.com";
