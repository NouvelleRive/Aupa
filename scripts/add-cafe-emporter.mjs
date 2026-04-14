import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, addDoc, collection } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDAjm-Sg5ABbkoU54noDFsyADAYfTnXHDc",
  authDomain: "aupa-be0e5.firebaseapp.com",
  projectId: "aupa-be0e5",
  storageBucket: "aupa-be0e5.firebasestorage.app",
  messagingSenderId: "1069749466934",
  appId: "1:1069749466934:web:33a4d4b04e9a9772cf2597",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Récupérer la recette Expresso (= café)
const expresso = (await getDoc(doc(db, 'recettes', 'WKJfDpqexgWKChLNllUE'))).data();

// Cloner avec nouveau nom et prix
const ref = await addDoc(collection(db, 'recettes'), {
  ...expresso,
  nom: 'Café à emporter',
  prixVente: 1.50,
  updatedAt: new Date().toISOString(),
});
console.log(`Café à emporter créé: ${ref.id}`);
