
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini with the required direct API key access
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Corrects a location string to a Google Maps searchable format using Gemini.
 */
export const magicalCorrectLocation = async (query: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `請校正此地標："${query}"`,
      config: { 
        systemInstruction: "你是一個日本旅遊專家。請將輸入的模糊景點、地址或地標名稱校正為 Google 地圖最容易搜尋到的完整、正確地標名稱（繁體中文或日文混用）。只需回傳校正後的名稱，不要包含任何解釋。",
        temperature: 0.1 
      }
    });
    // Accessing .text as a property as per current SDK guidelines
    return response.text?.trim() || query;
  } catch (error) {
    console.error("Gemini Error:", error);
    return query;
  }
};

/**
 * Estimates transport time between two points in Japan.
 */
export const estimateTransportTime = async (origin: string, destination: string, mode: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `從「${origin}」到「${destination}」使用「${mode}」`,
      config: { 
        systemInstruction: "估計日本交通時間（以分鐘為單位）。只需回傳一個數字和單位（例如：35分鐘），不要有其他文字。",
        temperature: 0.1 
      }
    });
    // Accessing .text as a property as per current SDK guidelines
    return response.text?.trim() || "30分鐘";
  } catch (error) {
    console.error("Gemini Transport Estimation Error:", error);
    return "30分鐘";
  }
};
