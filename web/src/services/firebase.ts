import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

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
export const functions = getFunctions(firebaseApp, 'us-central1');

if (env.useFirebaseEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.info('Using local Firebase emulators. No cloud Firebase data will be changed.');
}
