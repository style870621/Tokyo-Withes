
import { GoogleGenAI } from "@google/genai";

/**
 * 獲取並檢查 API Key
 */
const checkKey = () => {
  const key = process.env.API_KEY;
  if (!key || key === "undefined") {
    console.error("Gemini 密語錯誤：找不到有效的 API_KEY，請檢查 Vercel 環境變數設定。");
    return null;
  }
  return key;
};

/**
 * 功能 1：魔法校正地標
 */
export const magicalCorrectLocation = async (query: string): Promise<string> => {
  const apiKey = checkKey();
  if (!apiKey) return query;

  // 嚴格遵守 SDK 初始化規範
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `請校正此地標名稱：「${query}」`,
      config: {
        systemInstruction: "你是一個日本旅遊巫師。請將輸入的地名、景點或地址校正為 Google 地圖最易搜尋到的正式名稱。只需回傳名稱，不要有標點符號、括號或引號。如果無法校正，請回傳原始內容。",
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
  const apiKey = checkKey();
  if (!apiKey) return "30分鐘";

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `從「${origin}」到「${destination}」，使用方式：${mode}`,
      config: {
        systemInstruction: "你是一個日本交通占卜師。請估算日本境內兩地間的交通時間（含等待）。只需回傳數字與單位，例如「45分鐘」或「1小時20分鐘」，不要回傳其他贅詞。",
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
