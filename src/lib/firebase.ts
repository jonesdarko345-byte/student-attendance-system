import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  User as FirebaseUser
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  enableNetwork,
  disableNetwork,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

// Support both Vercel environment variables (VITE_FIREBASE_*) and bundled firebase-applet-config.json
const configWithOptionalDb = defaultConfig as typeof defaultConfig & {
  firestoreDatabaseId?: string;
};

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultConfig.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain,
  firestoreDatabaseId:
    import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    import.meta.env.VITE_FIRESTORE_DATABASE_ID ||
    configWithOptionalDb.firestoreDatabaseId ||
    'ai-studio-remixstudentbiom-5d7ae755-01c3-4373-8086-2a5905a03153',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultConfig.messagingSenderId,
};

export const activeFirestoreDatabaseId = firebaseConfig.firestoreDatabaseId;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long-polling (prevents 10s WebChannel streaming hangs in iframes/proxies)
// and multi-tab persistent cache with clean memoryLocalCache fallback
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        experimentalLongPollingOptions: { timeoutSeconds: 15 },
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          experimentalLongPollingOptions: { timeoutSeconds: 15 },
          localCache: memoryLocalCache(),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
})();

// Sync browser online/offline transitions so Firestore enters offline cache cleanly without 10s stream timeouts
if (typeof window !== 'undefined') {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    disableNetwork(db).catch(() => {});
  }
  window.addEventListener('offline', () => {
    disableNetwork(db).catch(() => {});
  });
  window.addEventListener('online', () => {
    enableNetwork(db).catch(() => {});
  });
}

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Least-privilege Workspace OAuth scope for HOD/Lecturer Gmail notification emails
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send'
] as const;

export const googleProvider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => googleProvider.addScope(scope));

// Strictly in-memory OAuth access token cache (never persisted to Web Storage)
let cachedGmailAccessToken: string | null = null;

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function clearCachedGmailAccessToken(): void {
  cachedGmailAccessToken = null;
}

// Automatically clear in-memory token whenever Firebase Auth signs out
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGmailAccessToken = null;
  }
});

// Operation Types for Structured Error Diagnostics
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection to Firestore using an abortable HTTP preflight before server read
export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const abortTimer = setTimeout(() => controller?.abort(), 4000);

  try {
    const dbId = encodeURIComponent(firebaseConfig.firestoreDatabaseId || '(default)');
    const probeUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${dbId}/documents/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(probeUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });
    clearTimeout(abortTimer);

    // Reaching Firestore (200 OK or 404 NOT_FOUND for test/connection) confirms backend reachability
    if (!res.ok && res.status !== 404) {
      return false;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection check timeout')), 4500);
    });
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeoutPromise
    ]);
    return true;
  } catch (error) {
    clearTimeout(abortTimer);
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('the client is offline') || error.message.includes('timeout'))) {
      console.info('[Firestore] Background connection warming up or operating in cached mode.');
    }
    return false;
  }
}

// Auth Helper Functions
export async function signInWithGoogle(forceAccountPrompt = false) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineErr = new Error('Your browser appears to be offline.') as Error & { code?: string };
    offlineErr.code = 'auth/network-request-failed';
    throw offlineErr;
  }

  try {
    const provider = new GoogleAuthProvider();
    if (forceAccountPrompt) {
      provider.setCustomParameters({ prompt: 'select_account' });
    }
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      console.error('Google Sign-In Error:', error);
    }
    throw error;
  }
}

/**
 * Acquires a fresh Google OAuth access token scoped with gmail.send strictly from a user click.
 * Keeps the token purely in memory; never persists to localStorage/sessionStorage.
 */
export async function authorizeGmailSending(loginHintEmail?: string, forceConsent = false): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineErr = new Error('Your browser appears to be offline.') as Error & { code?: string };
    offlineErr.code = 'auth/network-request-failed';
    throw offlineErr;
  }

  if (!forceConsent && cachedGmailAccessToken) {
    return cachedGmailAccessToken;
  }

  const provider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  const params: Record<string, string> = {};
  if (loginHintEmail) {
    params.login_hint = loginHintEmail;
  }
  if (forceConsent) {
    params.prompt = 'consent';
  }
  if (Object.keys(params).length > 0) {
    provider.setCustomParameters(params);
  }

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Google did not return a Gmail sending permission token. Please accept the Gmail Send permission prompt and try again.');
  }
  cachedGmailAccessToken = credential.accessToken;
  return credential.accessToken;
}

export async function silentSignInAnonymously() {
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err) {
    console.log('[Auth] Anonymous background sign-in unavailable, proceeding with local credentials:', err);
    return null;
  }
}

export async function logOut() {
  try {
    cachedGmailAccessToken = null;
    await signOut(auth);
  } catch (error) {
    console.error('Sign-Out Error:', error);
    throw error;
  }
}

export { onAuthStateChanged };
export type { FirebaseUser };
