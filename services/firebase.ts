import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 儲存行程資料
export const saveItinerary = (id: string, data: any) => {
  set(ref(db, 'plans/' + id), data);
};

// 監聽行程資料（實現即時同步）
export const listenToItinerary = (id: string, callback: (data: any) => void) => {
  const planRef = ref(db, 'plans/' + id);
  onValue(planRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};
