import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { generateSummary, generateFlashcards, generateQuiz, chatWithDocument } from "@/lib/services/ai.service";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, text, userMessage, history, assetId } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    if (action === "summary") {
      const summary = await generateSummary(text);
      if (assetId) {
         await prisma.aiAnalysis.upsert({
           where: { assetId },
           update: { summary },
           create: { assetId, summary, transcript: text }
         });
      }
      return NextResponse.json({ summary });
    }

    if (action === "flashcards") {
      const flashcards = await generateFlashcards(text);
      if (assetId) {
         const analysis = await prisma.aiAnalysis.upsert({
           where: { assetId },
           update: {},
           create: { assetId, transcript: text }
         });
         // Save flashcards
         for (const card of flashcards) {
           await prisma.flashcard.create({
             data: {
               aiAnalysisId: analysis.id,
               front: card.front,
               back: card.back
             }
           });
         }
      }
      return NextResponse.json({ flashcards });
    }

    if (action === "quiz") {
      const quiz = await generateQuiz(text);
      return NextResponse.json({ quiz });
    }

    if (action === "chat") {
      const response = await chatWithDocument(text, userMessage, history);
      return NextResponse.json({ response });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("[AI Generate Error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
