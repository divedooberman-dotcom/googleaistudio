import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Provider Setup with Drive Read-Only access
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive access token from authentication.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Google Drive API helper functions
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
}

export const listDriveFiles = async (token: string): Promise<DriveFile[]> => {
  const query = encodeURIComponent("mimeType != 'application/vnd.google-apps.folder' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=40&orderBy=modifiedTime desc`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || 'Failed to fetch files from Google Drive');
  }

  const data = await res.json();
  return data.files || [];
};

export const fetchDriveFileContent = async (token: string, file: DriveFile): Promise<string> => {
  const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
  let url = '';

  if (isGoogleDoc) {
    // Export Google Docs to plain text
    url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
  } else {
    // Fetch regular file media directly
    url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  }

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (isGoogleDoc) {
      throw new Error(`Failed to export Google Doc: ${file.name}`);
    } else {
      throw new Error(`Failed to download file content: ${file.name}. Only text-based or Google Doc files are supported.`);
    }
  }

  // Treat as text content
  const text = await res.text();
  return text;
};
