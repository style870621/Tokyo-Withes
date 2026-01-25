
import { GoogleGenAI } from "@google/genai";

/**
 * 魔法核心：安全獲取並清洗 API Key
 */
const getCleanApiKey = () => {
  const rawKey = process.env.API_KEY;
  if (!rawKey || rawKey === "undefined" || rawKey.length < 10) {
    return null;
  }
  // 強制去除可能存在的換行或空白字元，這是解決 400 錯誤的關鍵
  return rawKey.trim();
};

/**
 * 功能 1：魔法校正地標
 */
export const magicalCorrectLocation = async (query: string): Promise<string> => {
  const apiKey = getCleanApiKey();
  if (!apiKey) {
    console.error("Gemini 魔法失效：請檢查 Vercel 中的 API_KEY 是否正確設定。");
    return query;
  }

  // 每次呼叫重新實例化以確保使用最新的 Key 狀態
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `請校正此日本地標名稱，僅回傳校正後的完整正式名稱：「${query}」` }] }],
      config: {
        systemInstruction: "你是一個專業的日本旅遊地理巫師。請將輸入的地名、景點、地址校正為 Google 地圖最容易搜尋到的正式名稱（繁體中文或日文）。不要回傳任何解釋、引號或標點。如果無法辨識，請原樣回傳。",
        temperature: 0.1,
      },
    });

    const result = response.text?.trim();
    return result || query;
  } catch (error) {
    console.error("Magic Correction Error:", error);
    return query;
  }
};

/**
 * 功能 2：魔法估算交通時長
 */
export const estimateTransportTime = async (origin: string, destination: string, mode: string): Promise<string> => {
  const apiKey = getCleanApiKey();
  if (!apiKey) return "30分鐘";

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `起點：${origin}，終點：${destination}，交通方式：${mode}。請估計日本境內的移動時間。` }] }],
      config: {
        systemInstruction: "你是一個日本交通占卜師。請估算日本境內兩地間的交通時間（含等待時間）。只需回傳時間單位（如：45分鐘、1小時10分），不要回傳任何其他贅字。",
        temperature: 0.1,
      },
    });

    const result = response.text?.trim();
    return result || "30分鐘";
  } catch (error) {
    console.error("Magic Transport Error:", error);
    return "30分鐘";
  }
};
