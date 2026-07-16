export const env = {
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  useFirebaseEmulators:
    import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
  bootstrapAdminEmail: import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL as
    | string
    | undefined,
};

export const hasFirebaseConfig =
  !!env.firebaseApiKey &&
  !!env.firebaseAuthDomain &&
  !!env.firebaseProjectId &&
  !!env.firebaseStorageBucket &&
  !!env.firebaseMessagingSenderId &&
  !!env.firebaseAppId;
