"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, MessageSquare, Layers, 
  BrainCircuit, LayoutPanelLeft, ListTodo, ChevronLeft
} from "lucide-react";
import ReactPlayer from "react-player";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

import { useRouter } from "next/navigation";

function Flashcard({ front, back, index }: { front: string, back: string, index: number }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="relative w-full h-64 [perspective:1000px] cursor-pointer group mb-6" onClick={() => setIsFlipped(!isFlipped)}>
      <motion.div
        className="w-full h-full relative [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
      >
        {/* Front */}
        <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] p-6 bg-neutral-800/80 border border-neutral-700/50 rounded-2xl flex flex-col items-center justify-center text-center shadow-lg group-hover:border-indigo-500/50 transition-colors">
          <p className="absolute top-4 left-4 text-xs font-bold text-indigo-400 uppercase tracking-wider">Card {index + 1}</p>
          <p className="text-xl text-white font-medium">{front}</p>
          <p className="absolute bottom-4 text-xs text-neutral-500 flex items-center gap-1"><Layers className="w-3 h-3"/> Click to flip</p>
        </div>

        {/* Back */}
        <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] p-6 bg-indigo-900/30 border border-indigo-500/30 rounded-2xl flex flex-col items-center justify-center text-center shadow-lg">
          <p className="absolute top-4 left-4 text-xs font-bold text-indigo-300 uppercase tracking-wider">Answer</p>
          <div className="text-lg text-indigo-100">{back}</div>
          
          <div className="absolute bottom-4 flex gap-2 w-full px-6 justify-center" onClick={(e) => e.stopPropagation()}>
            <button className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-medium transition-colors">Hard</button>
            <button className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg text-xs font-medium transition-colors">Good</button>
            <button className="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-medium transition-colors">Easy</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function AiStudySessionClient({ asset }: { asset: any }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("summary");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{role: string, content: string}>>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze_asset",
          assetId: asset.id,
        })
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const tabs = [
    { id: "summary", label: "Smart Summary", icon: FileText },
    { id: "flashcards", label: "Flashcards", icon: Layers },
    { id: "chat", label: "Q&A Chat", icon: MessageSquare },
    { id: "transcript", label: "Transcript", icon: ListTodo },
  ];

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const newMessage = { role: "user", content: chatInput };
    setChatHistory([...chatHistory, newMessage]);
    setChatInput("");
    setIsChatting(true);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          text: asset.aiAnalysis?.transcript || asset.title,
          userMessage: newMessage.content,
          history: chatHistory
        })
      });
      const data = await res.json();
      if (data.response) {
        setChatHistory(prev => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="h-16 shrink-0 border-b border-neutral-800/50 bg-neutral-900/50 backdrop-blur px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/shelf" className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-400 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-medium text-white truncate max-w-xl">{asset.title}</h1>
            <p className="text-xs text-neutral-400 capitalize">{asset.kind} • AI Enhanced</p>
          </div>
        </div>
        <button 
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 border border-indigo-500/20 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          {isGenerating ? (
             <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
          ) : (
            <BrainCircuit className="w-4 h-4" />
          )}
          {isGenerating ? "Analyzing..." : "Regenerate AI"}
        </button>
      </header>

      {/* Main Split View */}
      <PanelGroup orientation="horizontal" className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Resource Viewer */}
        <Panel defaultSize={50} minSize={30} className="border-r border-neutral-800/50 bg-black relative flex flex-col items-center justify-center">
          {asset.kind === "video" && asset.sourceUrl ? (
            <ReactPlayer 
              src={asset.sourceUrl} 
              width="100%" 
              height="100%" 
              controls 
              style={{ position: 'absolute', top: 0, left: 0 }}
            />
          ) : asset.kind === "pdf" ? (
             <div className="text-neutral-500 flex flex-col items-center gap-3">
               <FileText className="w-12 h-12" />
               <p>PDF Viewer (Integrate react-pdf here)</p>
             </div>
          ) : (
            <div className="text-neutral-500 flex flex-col items-center gap-3">
              <LayoutPanelLeft className="w-12 h-12" />
              <p>Viewer not supported for this media type yet.</p>
            </div>
          )}
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-neutral-900 hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors cursor-col-resize z-10" />

        {/* Right Side: AI Tools */}
        <Panel defaultSize={50} minSize={30} className="bg-neutral-900/30 flex flex-col relative overflow-hidden">
          {/* Tabs */}
          <div className="flex p-2 gap-2 border-b border-neutral-800/50 overflow-x-auto no-scrollbar shrink-0">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive ? "bg-white/10 text-white" : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <AnimatePresence mode="wait">
              {activeTab === "summary" && (
                <motion.div 
                  key="summary"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="prose prose-invert prose-indigo max-w-none"
                >
                  {asset.aiAnalysis?.summary ? (
                    <ReactMarkdown>{asset.aiAnalysis.summary}</ReactMarkdown>
                  ) : (
                    <div className="text-center py-20 text-neutral-500">
                      {isGenerating ? (
                        <>
                          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-6" />
                          <p className="text-indigo-400 font-medium animate-pulse">Extracting knowledge and generating insights...</p>
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="w-10 h-10 mx-auto mb-4 opacity-50" />
                          <p>No summary generated yet.</p>
                          <button onClick={handleGenerate} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-colors">
                            Analyze Resource Now
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "flashcards" && (
                <motion.div 
                  key="flashcards"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {asset.aiAnalysis?.flashcards?.length > 0 ? (
                    asset.aiAnalysis.flashcards.map((fc: any, i: number) => (
                      <Flashcard key={fc.id} front={fc.front} back={fc.back} index={i} />
                    ))
                  ) : (
                    <div className="text-center py-20 text-neutral-500">
                      <Layers className="w-10 h-10 mx-auto mb-4 opacity-50" />
                      <p>No flashcards generated yet.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "chat" && (
                <motion.div 
                  key="chat"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col h-full absolute inset-0 pb-0"
                >
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {chatHistory.length === 0 && (
                      <div className="text-center py-10 text-neutral-500">
                         <MessageSquare className="w-10 h-10 mx-auto mb-4 opacity-50" />
                         <p>Ask anything about this document.</p>
                      </div>
                    )}
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-neutral-800 text-neutral-200 rounded-bl-sm border border-neutral-700'}`}>
                          <div className="prose prose-invert max-w-none text-sm">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isChatting && (
                       <div className="flex justify-start">
                         <div className="bg-neutral-800 text-neutral-400 p-4 rounded-2xl rounded-bl-sm border border-neutral-700 animate-pulse text-sm">
                           Thinking...
                         </div>
                       </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-neutral-800 bg-neutral-900/80 backdrop-blur shrink-0">
                    <form 
                      onSubmit={(e) => { e.preventDefault(); handleChat(); }}
                      className="flex gap-2"
                    >
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="flex-1 bg-black/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button 
                        type="submit"
                        disabled={isChatting || !chatInput.trim()}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}

              {activeTab === "transcript" && (
                <motion.div 
                  key="transcript"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="prose prose-invert max-w-none text-neutral-300 whitespace-pre-wrap font-mono text-sm leading-relaxed"
                >
                  {asset.aiAnalysis?.transcript || "No transcript available."}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </Panel>
      </PanelGroup>
    </div>
  );
}
