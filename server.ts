import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Shared Gemini client utility initialized on the server
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON with a size limit suitable for uploaded images
  app.use(express.json({ limit: "15mb" }));

  // API Route: Classify Issue using Gemini
  app.post("/api/classify-issue", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: "imageBase64 and mimeType are required" });
      }

      // Extract raw base64 data by stripping out standard data URL prefixes if present
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const ai = getGeminiClient();

      const imagePart = {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      };

      const promptPart = {
        text: `Analyze this image of a community/civic issue. You must classify it and extract the following details into the JSON response:
1. "category": Choose the most fitting one: "pothole", "broken streetlight", "waste", "water leakage", "public infrastructure", or "other". Note: Choose "public infrastructure" when you detect issues like damaged roads, broken bridges, collapsed walls, faulty traffic signals, or damaged public buildings.
2. "severity": Select "low", "medium", or "high" based on hazard level, public disruption, or damage severity.
3. "department": Suggest the appropriate local government agency (e.g. "Department of Transportation", "Sanitation Department", "Water & Power", "Department of Public Works").
4. "title": Provide a concise, descriptive human-readable title (e.g. "Pothole on Main St", "Broken Streetlight near Library").
5. "description": Write a polite, detailed, and objective summary describing the civic issue observed in the photo.`,
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, promptPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: "Classified civic issue category. Must be one of: pothole, broken streetlight, waste, water leakage, public infrastructure, other",
              },
              severity: {
                type: Type.STRING,
                description: "The safety severity level. Must be one of: low, medium, high",
              },
              department: {
                type: Type.STRING,
                description: "The suggested local government department to route this report to",
              },
              title: {
                type: Type.STRING,
                description: "A short, professional title describing the issue",
              },
              description: {
                type: Type.STRING,
                description: "A clear, professional summary describing what needs to be fixed",
              },
            },
            required: ["category", "severity", "department", "title", "description"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text received from Gemini API");
      }

      const classification = JSON.parse(responseText.trim());
      res.json(classification);
    } catch (error: any) {
      console.error("Gemini Classification Error:", error);
      res.status(500).json({ error: error.message || "Failed to classify the issue" });
    }
  });

  // Serve static assets in production, use Vite dev server in development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await (Function('return import("vite")')() as Promise<typeof import("vite")>);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
