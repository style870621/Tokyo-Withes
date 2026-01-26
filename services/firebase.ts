import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

// 這裡直接填入你在 Firebase 看到的 Config 內容
const firebaseConfig = {
  apiKey: "AIzaSyBgmKuYRIrib3HSBltyCCPDSai2FEJjOy8",
  authDomain: "tokyo-little-monster.firebaseapp.com",
  projectId: "tokyo-little-monster",
  storageBucket: "tokyo-little-monster.firebasestorage.app",
  messagingSenderId: "3251055849",
  appId: "1:3251055849:web:21492ce4307c4f822d1478",
  measurementId: "G-BQBQLYYCYZ"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 儲存行程：將資料寫入 Firebase 並同步給所有人
export const saveItinerary = (planId, data) => {
  set(ref(db, 'plans/' + planId), data);
};

// 監聽行程：當別人修改時，你的網頁會自動跳動更新
export const listenToItinerary = (planId, callback) => {
  const planRef = ref(db, 'plans/' + planId);
  onValue(planRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};
