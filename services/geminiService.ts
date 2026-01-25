
import { GoogleGenAI } from "@google/genai";

/**
 * 魔法核心：安全獲取並清洗 API Key
 */
const getCleanApiKey = () => {
  let rawKey = process.env.API_KEY;
  
  // 偵錯日誌：讓使用者知道目前讀取到的原始值是什麼（前 5 碼）
  if (rawKey) {
    const debugStr = rawKey.substring(0, 5);
    console.log(`[Gemini Debug] 偵測到環境變數，開頭為: ${debugStr}...`);
  } else {
    console.warn(`[Gemini Debug] ❌ 完全找不到 process.env.API_KEY`);
  }

  if (!rawKey || rawKey === "undefined" || rawKey.length < 10) {
    return null;
  }

  // 徹底移除引號、空白、換行符號
  const cleanKey = rawKey.replace(/['"\s\n\r]+/g, '').trim();
  
  // 最終檢查日誌
  console.log(`[Gemini Debug] 清洗後金鑰長度: ${cleanKey.length}, 開頭: ${cleanKey.substring(0, 4)}, 結尾: ${cleanKey.substring(cleanKey.length - 4)}`);
  
  return cleanKey;
};

/**
 * 供 UI 診斷使用的函數
 */
export const getApiKeyStatus = () => {
  const key = getCleanApiKey();
  if (!key) return { ok: false, msg: "未偵測到 API_KEY" };
  return {
    ok: key.startsWith("AIza"),
    len: key.length,
    prefix: key.substring(0, 4),
    suffix: key.substring(key.length - 4),
    msg: key.startsWith("AIza") ? "格式正確" : "格式錯誤 (應為 AIza 開頭)"
  };
};

export const magicalCorrectLocation = async (query: string): Promise<string> => {
  const apiKey = getCleanApiKey();
  if (!apiKey) {
    console.error("[Gemini Debug] 無法執行校正：金鑰不存在。");
    return query;
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `請校正此日本地名為正式名稱：「${query}」` }] }],
      config: {
        systemInstruction: "你是一個專業的日本旅遊巫師。請將輸入的地標、地址校正為 Google 地圖最容易搜尋到的繁體中文或日文名稱。只需回傳名稱，不要有標點或解釋。",
        temperature: 0.1,
      },
    });
    console.log("[Gemini Debug] 魔法校正成功回傳！");
    return response.text?.trim() || query;
  } catch (error: any) {
    console.error("[Gemini Debug] API 報錯內容:", error);
    return query;
  }
};

export const estimateTransportTime = async (origin: string, destination: string, mode: string): Promise<string> => {
  const apiKey = getCleanApiKey();
  if (!apiKey) return "30分鐘";

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `從「${origin}」到「${destination}」，方式：${mode}` }] }],
      config: {
        systemInstruction: "估算日本境內移動時間。只需回傳時間（如：45分鐘），不要贅詞。",
        temperature: 0.1,
      },
    });
    return response.text?.trim() || "30分鐘";
  } catch (error) {
    console.error("[Gemini Debug] 交通估算報錯:", error);
    return "30分鐘";
  }
};
