
import { GoogleGenAI } from "@google/genai";

/**
 * 測試連線並回傳詳細錯誤
 * @google/genai rule: Always use new GoogleGenAI({apiKey: process.env.API_KEY})
 */
export const testConnection = async (): Promise<{ ok: boolean; msg: string }> => {
  // Create instance right before call as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "hi",
    });
    // @google/genai rule: Access .text property directly
    if (response.text) {
      return { ok: true, msg: "連線成功！魔法運作正常。" };
    }
    return { ok: false, msg: "連線成功但無回傳文字" };
  } catch (error: any) {
    console.error("[Gemini Debug] 測試失敗:", error);
    const errMsg = error.message || "";
    if (errMsg.includes("API key not valid")) return { ok: false, msg: "❌ 金鑰無效：請檢查環境變數設定" };
    return { ok: false, msg: `❌ 錯誤: ${errMsg.substring(0, 50)}...` };
  }
};

/**
 * 景點名稱校正
 * @google/genai rule: Use gemini-3-flash-preview for basic text tasks
 */
export const magicalCorrectLocation = async (query: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `請校正此日本地名為正式名稱：「${query}」`,
      config: {
        systemInstruction: "你是一個專業的日本旅遊巫師。請將輸入的地標、地址校正為 Google 地圖最容易搜尋到的繁體中文或日文名稱。只需回傳名稱，不要有標點或解釋。",
        temperature: 0.1,
      },
    });
    return response.text?.trim() || query;
  } catch (error) {
    console.error("[Gemini Debug] 校正錯誤:", error);
    return query;
  }
};

/**
 * 估算交通時間
 * @google/genai rule: Use gemini-3-flash-preview for basic text tasks
 */
export const estimateTransportTime = async (origin: string, destination: string, mode: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `從「${origin}」到「${destination}」，方式：${mode}`,
      config: {
        systemInstruction: "估算日本境內移動時間。只需回傳時間（如：45分鐘），不要贅詞。",
        temperature: 0.1,
      },
    });
    return response.text?.trim() || "30分鐘";
  } catch (error) {
    console.error("[Gemini Debug] 交通估算錯誤:", error);
    return "30分鐘";
  }
};
