
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, off } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBgmKuYRIrib3HSBltyCCPDSai2FEJjOy8",
  authDomain: "tokyo-little-monster.firebaseapp.com",
  projectId: "tokyo-little-monster",
  storageBucket: "tokyo-little-monster.firebasestorage.app",
  messagingSenderId: "3251055849",
  appId: "1:3251055849:web:21492ce4307c4f822d1478",
  measurementId: "G-BQBQLYYCYZ",
  databaseURL: "https://tokyo-little-monster-default-rtdb.firebaseio.com"
};

let db: any;
try {
  // Use modular SDK to initialize app
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("[Firebase] 初始化失敗:", e);
}

export const pushToRoom = async (roomId: string, data: any) => {
  if (!db || !roomId) return;
  try {
    const roomRef = ref(db, `rooms/${roomId}`);
    await set(roomRef, { ...data, timestamp: Date.now() });
  } catch (e) {
    console.error("[Firebase] 資料推送失敗:", e);
  }
};

export const subscribeToRoom = (roomId: string, callback: (data: any) => void) => {
  if (!db || !roomId) return () => {};
  const roomRef = ref(db, `rooms/${roomId}`);
  const unsubscribe = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (data) callback(data);
  }, (error) => {
    console.error("[Firebase] 讀取資料失敗:", error);
  });
  return () => off(roomRef, "value", unsubscribe);
};
