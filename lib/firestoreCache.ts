import { collection, getDocs, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from './firebase';

const TTL_MS = 2 * 60 * 1000;

type Docs = QueryDocumentSnapshot<DocumentData>[];
type Snap = { docs: Docs; size: number; empty: boolean };
type Entry = { snap: Snap; expiresAt: number; promise?: Promise<Snap> };

const cache = new Map<string, Entry>();

function toSnap(docs: Docs): Snap {
  return { docs, size: docs.length, empty: docs.length === 0 };
}

export async function cachedGetDocs(name: string): Promise<Snap> {
  const now = Date.now();
  const entry = cache.get(name);
  if (entry && entry.expiresAt > now) return entry.snap;
  if (entry?.promise) return entry.promise;
  const promise = getDocs(collection(db, name)).then(s => {
    const snap = toSnap(s.docs);
    cache.set(name, { snap, expiresAt: Date.now() + TTL_MS });
    return snap;
  });
  cache.set(name, { snap: entry?.snap ?? toSnap([]), expiresAt: 0, promise });
  return promise;
}

export function invalidateCache(...names: string[]) {
  for (const n of names) cache.delete(n);
}
