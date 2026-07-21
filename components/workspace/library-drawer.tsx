"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, X, Search, FileText, Youtube } from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function LibraryDrawer({ onDragResource }: { onDragResource: (asset: any, position: {x: number, y: number}) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // In a real app, you would fetch the user's library items here
  // Mocking it for the architectural skeleton
  const mockAssets = [
    { id: "1", title: "Quantum Physics Chapter 1", kind: "pdf", hasAi: true },
    { id: "2", title: "React Architecture Deep Dive", kind: "video", hasAi: true },
    { id: "3", title: "Daily Notes", kind: "text", hasAi: false },
  ];

  const handleDragStart = (e: React.DragEvent, asset: any) => {
    e.dataTransfer.setData("application/json", JSON.stringify(asset));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed top-20 right-6 z-50 p-3 bg-neutral-900/80 backdrop-blur border border-neutral-700 hover:border-indigo-500 rounded-2xl shadow-xl transition-all group"
      >
        <Library className="w-6 h-6 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed top-0 right-0 w-80 h-full bg-neutral-900/90 backdrop-blur-xl border-l border-neutral-800 shadow-2xl z-[60] flex flex-col"
          >
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Library className="w-5 h-5 text-indigo-400" />
                My Library
              </h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-neutral-800">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search materials..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-black/50 border border-neutral-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-2">Drag to canvas</p>
              
              {mockAssets.filter(a => a.title.toLowerCase().includes(search.toLowerCase())).map(asset => (
                <div 
                  key={asset.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, asset)}
                  className="p-3 bg-neutral-800/50 border border-neutral-700 rounded-xl cursor-grab active:cursor-grabbing hover:border-indigo-500/50 transition-colors group flex items-start gap-3"
                >
                  <div className="p-2 bg-neutral-900 rounded-lg shrink-0">
                    {asset.kind === "video" ? <Youtube className="w-4 h-4 text-red-400" /> : <FileText className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-medium text-white truncate">{asset.title}</h4>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] text-neutral-500 capitalize">{asset.kind}</span>
                      {asset.hasAi && <span className="text-[10px] text-indigo-400 font-medium">AI Ready</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
