import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import { env, hasFirebaseConfig } from '../config/env';

if (!hasFirebaseConfig) {
  // Keep startup resilient while env is being configured.
  console.warn('Missing Firebase env config. Auth flows will not work until env vars are set.');
}

const firebaseApp = initializeApp({
  apiKey: env.firebaseApiKey ?? 'missing',
  authDomain: env.firebaseAuthDomain ?? 'missing',
  projectId: env.firebaseProjectId ?? 'missing',
  storageBucket: env.firebaseStorageBucket ?? 'missing',
  messagingSenderId: env.firebaseMessagingSenderId ?? 'missing',
  appId: env.firebaseAppId ?? 'missing',
});

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
