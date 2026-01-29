
import { GoogleGenAI, Type } from "@google/genai";
import { SmartPlacement } from "../types";

export const getSmartLogoPosition = async (imageBase64: string): Promise<SmartPlacement> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `Role: E-commerce Vision Specialist.
Task: 
1. Detect the main product in this image.
2. Provide the bounding box for the product in normalized coordinates [ymin, xmin, ymax, xmax] (0-1000 scale).
3. Determine the optimal 'Negative Space' corner (top-left, top-right, bottom-left, or bottom-right) for a logo that avoids the product completely.
4. Return ONLY a JSON object with this structure: {"position": "top-right", "padding": 50, "boundingBox": [ymin, xmin, ymax, xmax]}.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            position: {
              type: Type.STRING,
              description: "The ideal corner for the logo",
              enum: ["top-left", "top-right", "bottom-left", "bottom-right", "center"]
            },
            padding: {
              type: Type.NUMBER,
              description: "Suggested padding in pixels (scaled to 1000px width base)"
            },
            boundingBox: {
              type: Type.ARRAY,
              description: "Normalized bounding box of the product: [ymin, xmin, ymax, xmax]",
              items: { type: Type.NUMBER },
              minItems: 4,
              maxItems: 4
            }
          },
          required: ["position", "padding", "boundingBox"]
        }
      }
    });

    try {
      const data = JSON.parse(response.text || "{}");
      return {
        position: data.position?.toLowerCase() || 'bottom-right',
        padding: data.padding || 50,
        boundingBox: data.boundingBox ? {
          ymin: data.boundingBox[0],
          xmin: data.boundingBox[1],
          ymax: data.boundingBox[2],
          xmax: data.boundingBox[3]
        } : undefined
      };
    } catch (e) {
      return { position: 'bottom-right', padding: 50 };
    }
  } catch (error) {
    console.error("Gemini AI Analysis failed, using fallback:", error);
    return { position: 'bottom-right', padding: 50 };
  }
};
