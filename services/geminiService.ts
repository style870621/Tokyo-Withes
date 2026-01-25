
import { GoogleGenAI } from "@google/genai";

/**
 * 核心：獲取 API Key
 * 在此環境中，API Key 應由系統自動注入 process.env.API_KEY
 */
const getApiKey = () => {
  const key = process.env.API_KEY;
  if (!key || key === "undefined" || key.length < 10) {
    console.error("Gemini 魔法失效：找不到有效的 API_KEY。請檢查環境變數設定。");
    return null;
  }
  return key;
};

/**
 * 功能 1：校正地標名稱
 */
export const magicalCorrectLocation = async (query: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return query;

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `請校正此地標：「${query}」`,
      config: {
        systemInstruction: "你是一個日本旅遊專家。請將輸入的模糊景點、地址或地標名稱校正為 Google 地圖最容易搜尋到的完整、正確地標名稱（繁體中文或日文混用）。只需回傳校正後的名稱，不要包含任何解釋、標點符號或引號。",
        temperature: 0.1,
      },
    });

    // 注意：新版 SDK 中 text 是屬性而非方法
    const result = response.text?.trim();
    return result || query;
  } catch (error) {
    console.error("Gemini Location Error:", error);
    return query;
  }
};

/**
 * 功能 2：自動預估交通時長
 */
export const estimateTransportTime = async (origin: string, destination: string, mode: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "30分鐘";

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `起點：${origin}，終點：${destination}，方式：${mode}`,
      config: {
        systemInstruction: "你是一個日本交通分析師。請估計日本境內兩地間的交通時間。只需回傳一個數字和單位（例如：35分鐘），不要有其他文字。",
        temperature: 0.1,
      },
    });

    const result = response.text?.trim();
    return result || "30分鐘";
  } catch (error) {
    console.error("Gemini Transport Error:", error);
    return "30分鐘";
  }
};
