import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAjm-Sg5ABbkoU54noDFsyADAYfTnXHDc",
  authDomain: "aupa-be0e5.firebaseapp.com",
  projectId: "aupa-be0e5",
  storageBucket: "aupa-be0e5.firebasestorage.app",
  messagingSenderId: "1069749466934",
  appId: "1:1069749466934:web:33a4d4b04e9a9772cf2597",
  measurementId: "G-48SL0N0GHJ"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);