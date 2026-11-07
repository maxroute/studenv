import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export function isAiConfigured() {
  return Boolean(apiKey.trim());
}

export async function generateSummary(text: string): Promise<string> {
  if (!text) return "No content to summarize.";
  
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `Please provide a comprehensive and structured summary of the following text. Use markdown formatting with clear headings and bullet points where appropriate.\n\nText:\n${text}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function generateFlashcards(text: string): Promise<Array<{ front: string; back: string }>> {
  if (!text) return [];

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `Create 10 important study flashcards based on the following text. 
  Output strictly as a valid JSON array of objects, where each object has a "front" (the question) and "back" (the answer) field.
  Do not include any markdown backticks or explanation. Just the raw JSON array.
  
  Text:\n${text}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const rawText = response.text().trim();
  
  // Clean JSON string
  const jsonStr = rawText.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse flashcards JSON:", e);
    return [];
  }
}

export async function generateQuiz(text: string): Promise<any[]> {
  if (!text) return [];

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `Create a 5-question multiple choice quiz based on the following text.
  Output strictly as a valid JSON array of objects.
  Each object must have:
  - "question": string
  - "options": array of exactly 4 strings
  - "correctAnswer": string (must exactly match one of the options)
  - "explanation": string
  
  Do not include any markdown backticks or explanation. Just the raw JSON array.
  
  Text:\n${text}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const rawText = response.text().trim();
  
  const jsonStr = rawText.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse quiz JSON:", e);
    return [];
  }
}

export async function chatWithDocument(text: string, userMessage: string, history: Array<{role: string, content: string}> = []): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  // Convert history to Gemini format if needed, but for simplicity we'll inject it into the prompt.
  let chatHistory = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  
  const prompt = `You are a helpful AI tutor assisting a student with a document.
  
  Document Context:
  ${text.substring(0, 50000)} // Ensure we don't exceed limits
  
  Chat History:
  ${chatHistory}
  
  User: ${userMessage}
  Assistant:`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}
