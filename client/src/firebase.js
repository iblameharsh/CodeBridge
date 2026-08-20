import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCEOG4PR49OovV5OlSYy0auO50_pqAPaWs",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "codelive-27ae5.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "codelive-27ae5",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "codelive-27ae5.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "21754381998",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:21754381998:web:657c204fc7e27e07680f3f",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-8F2PE9521K",
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "https://codelive-27ae5-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };