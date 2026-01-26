
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, off } from "firebase/database";

// 使用您提供的 Firebase 專案設定
const firebaseConfig = {
  apiKey: "AIzaSyBgmKuYRIrib3HSBltyCCPDSai2FEJjOy8",
  authDomain: "tokyo-little-monster.firebaseapp.com",
  projectId: "tokyo-little-monster",
  storageBucket: "tokyo-little-monster.firebasestorage.app",
  messagingSenderId: "3251055849",
  appId: "1:3251055849:web:21492ce4307c4f822d1478",
  measurementId: "G-BQBQLYYCYZ",
  // Realtime Database 通常需要 databaseURL，根據 Project ID 推導
  databaseURL: "https://tokyo-little-monster-default-rtdb.firebaseio.com"
};

let app: any;
let db: any;

try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.error("[Firebase] 初始化失敗:", e);
}

/**
 * 推送資料到 Firebase 房間
 * @param roomId 房間 ID
 * @param data 完整的旅遊數據
 */
export const pushToRoom = async (roomId: string, data: any) => {
  if (!db || !roomId) return;
  try {
    const roomRef = ref(db, `rooms/${roomId}`);
    await set(roomRef, {
      ...data,
      timestamp: Date.now() // 加入時間戳記方便追蹤
    });
  } catch (e) {
    console.error("[Firebase] 資料推送到雲端失敗:", e);
  }
};

/**
 * 訂閱房間變動
 * @param roomId 房間 ID
 * @param callback 當雲端資料變動時執行的回呼函數
 */
export const subscribeToRoom = (roomId: string, callback: (data: any) => void) => {
  if (!db || !roomId) return () => {};
  
  const roomRef = ref(db, `rooms/${roomId}`);
  // 監聽雲端資料
  const unsubscribe = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      callback(data);
    }
  }, (error) => {
    console.error("[Firebase] 讀取雲端資料失敗:", error);
  });

  // 回傳取消訂閱的函數
  return () => off(roomRef, "value", unsubscribe);
};
