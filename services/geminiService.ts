
import { GoogleGenAI } from "@google/genai";

/**
 * 魔法核心：安全獲取並清洗 API Key
 */
const getCleanApiKey = () => {
  let rawKey = process.env.API_KEY;
  
  if (rawKey) {
    console.log(`[Gemini Debug] 讀取到原始變數，長度: ${rawKey.length}`);
  }

  if (!rawKey || rawKey === "undefined" || rawKey.length < 10) {
    return null;
  }

  // 徹底移除引號、空白、換行符號
  const cleanKey = rawKey.replace(/['"\s\n\r]+/g, '').trim();
  return cleanKey;
};

/**
 * 供 UI 診斷使用的函數
 */
export const getApiKeyStatus = () => {
  const key = getCleanApiKey();
  if (!key) return { ok: false, msg: "環境變數 API_KEY 為空或未設定" };
  
  // 檢查是否包含不該出現的字元（例如引號或 process.env 字樣）
  const hasQuotes = /['"]/.test(key);
  const isTemplateError = key.includes("process.env");

  if (isTemplateError) return { ok: false, msg: "設定錯誤：變數值被設成了程式碼文字" };
  if (hasQuotes) return { ok: false, msg: "格式錯誤：金鑰內含有引號" };

  return {
    ok: key.startsWith("AIza"),
    len: key.length,
    prefix: key.substring(0, 4),
    suffix: key.substring(key.length - 4),
    msg: key.startsWith("AIza") ? "格式初步檢查正常" : "格式錯誤 (應為 AIza 開頭)"
  };
};

/**
 * 測試連線並回傳詳細錯誤
 */
export const testConnection = async (): Promise<{ ok: boolean; msg: string }> => {
  const apiKey = getCleanApiKey();
  if (!apiKey) return { ok: false, msg: "找不到金鑰" };

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: "hi" }] }],
    });
    if (response.text) {
      return { ok: true, msg: "連線成功！魔法運作正常。" };
    }
    return { ok: false, msg: "連線成功但無回傳文字" };
  } catch (error: any) {
    console.error("[Gemini Debug] 測試失敗:", error);
    const errMsg = error.message || "";
    if (errMsg.includes("API key not valid")) return { ok: false, msg: "❌ 金鑰無效：請檢查是否複製完整或已被禁用" };
    if (errMsg.includes("model not found")) return { ok: false, msg: "❌ 模型錯誤：請確認模型名稱正確" };
    return { ok: false, msg: `❌ 錯誤: ${errMsg.substring(0, 50)}...` };
  }
};

export const magicalCorrectLocation = async (query: string): Promise<string> => {
  const apiKey = getCleanApiKey();
  if (!apiKey) return query;

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
    return response.text?.trim() || query;
  } catch (error) {
    console.error("[Gemini Debug] 校正錯誤:", error);
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
    console.error("[Gemini Debug] 交通估算錯誤:", error);
    return "30分鐘";
  }
};
