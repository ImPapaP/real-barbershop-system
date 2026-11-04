// Paste your web app config from Firebase console → Project settings → Your apps → Web app.
// These values are public by design; the security rules in firestore.rules protect the data.
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'your-project-id.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project-id.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID'
};

// Must match the region in functions/index.js
export const FUNCTIONS_REGION = 'asia-southeast1';
