import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function check() {
  const doc = await db.doc('config/gmail').get();
  if (doc.exists) {
    const d = doc.data()!;
    console.log('refresh_token:', d.refresh_token ? 'OUI (' + d.refresh_token.slice(0, 10) + '...)' : 'NON');
    console.log('updatedAt:', d.updatedAt);
  } else {
    console.log('config/gmail ABSENT');
  }
}

check().catch(console.error);
