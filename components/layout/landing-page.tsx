"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Download,
  Laptop,
  Globe,
  ArrowRight,
  ShieldCheck,
  Check,
  Zap,
  Users,
  Flame,
  BookOpen,
  Sparkles,
  Menu,
  X,
  Play,
  FileText,
  MessageSquare,
  Video,
  Clock,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { BrandLockup } from "@/components/ui/brand-logo";

interface LandingPageProps {
  session: any;
}

export default function LandingPage({ session }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopModalOpen, setDesktopModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"vault" | "ai" | "rooms">("vault");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [pricingCycle, setPricingCycle] = useState<"monthly" | "yearly">("monthly");
  const [selectedVaultItem, setSelectedVaultItem] = useState<string | null>(null);

  const toggleFaq = (index: number) => {
    setFaqOpen(faqOpen === index ? null : index);
  };

  const pricing = {
    monthly: { starter: "$0", student: "$4", team: "$12" },
    yearly: { starter: "$0", student: "$3.20", team: "$9.60" },
  };

  const features = [
    {
      icon: <BookOpen className="w-5 h-5 text-amber" />,
      title: "Knowledge Vault",
      description: "Upload PDFs, bookmark articles, extract YouTube transcripts, and write markdown notes. All organized in one searchable, custom-tagged library.",
    },
    {
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
      title: "Contextual AI Assistant",
      description: "Chat with your library. Ask questions about specific PDFs, summarize videos, auto-generate concept flashcards, and discover hidden connections.",
    },
    {
      icon: <Users className="w-5 h-5 text-teal" />,
      title: "Shared Study Rooms",
      description: "Create private groups to study together. Share a real-time group vault, draw on collaborative whiteboards, and talk over high-quality audio/video.",
    },
    {
      icon: <Flame className="w-5 h-5 text-red-400" />,
      title: "Focus & Flow State",
      description: "Block out distractions with customizable Pomodoro timers, background ambient soundscapes, and comprehensive session statistics.",
    },
  ];

  const faqs = [
    {
      q: "Is the desktop app fully synced with the web version?",
      a: "Yes! All your notes, uploaded PDFs, bookmarks, and configurations are synced in real-time between your web account and the desktop app.",
    },
    {
      q: "Does the desktop app support offline access?",
      a: "Yes. The desktop app caches your personal vault and text-based notes locally, allowing you to read and write without an active internet connection. Synced files will update automatically once you go back online.",
    },
    {
      q: "Why should I use the desktop app instead of the browser?",
      a: "The desktop app runs in a dedicated native container (Electron) which provides a zero-latency UI, native OS shortcuts (like globally opening the search bar), tray launcher, launch-on-startup, and runs entirely in its own sandboxed process with offline support.",
    },
    {
      q: "Are study rooms free to use?",
      a: "Yes! The Starter and Student plans allow you to join and host study groups. The premium Lab/Team plan increases the limit of concurrent active audio/video feeds and offers larger shared workspace vaults.",
    },
    {
      q: "What AI models power the assistant?",
      a: "Studenv uses Gemini 1.5 Pro and Flash to summarize, analyze, and query your documents. This ensures extremely fast response times and high accuracy in text extraction.",
    },
  ];

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-amber/30 selection:text-white font-sans overflow-x-hidden">

      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-amber/5 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[20%] right-10 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="absolute bottom-[20%] left-10 w-[600px] h-[600px] bg-teal/5 rounded-full blur-[140px] pointer-events-none z-0" />

      {/* HEADER */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-bg/75 backdrop-blur-xl transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <BrandLockup variant="mark" className="flex items-center gap-3 text-lg font-bold text-white" />
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted">
              <a href="#features" className="hover:text-text transition-colors">Features</a>
              <a href="#desktop" className="hover:text-text transition-colors">Desktop App</a>
              <a href="#pricing" className="hover:text-text transition-colors">Pricing</a>
              <a href="#faq" className="hover:text-text transition-colors">FAQ</a>
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              href={session ? "/dashboard" : "/auth/login"}
              className="text-sm font-medium hover:text-amber transition-colors px-4 py-2"
            >
              {session ? "Go to Dashboard" : "Sign In"}
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-bg bg-amber hover:bg-amber/90 transition-all px-4 py-2 rounded-lg font-medium shadow-lg shadow-amber/10 flex items-center gap-1.5"
            >
              Try Studenv <Globe className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => setDesktopModalOpen(true)}
              className="text-sm font-medium border border-border bg-surface hover:bg-surface2 transition-all px-4 py-2 rounded-lg flex items-center gap-1.5"
            >
              Get App <Download className="w-4 h-4 text-amber" />
            </button>
          </div>

          {/* MOBILE MENU TOGGLE */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-muted hover:text-text transition-colors"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* MOBILE MENU */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-surface px-4 py-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium py-1 text-muted hover:text-text transition-colors"
            >
              Features
            </a>
            <a
              href="#desktop"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium py-1 text-muted hover:text-text transition-colors"
            >
              Desktop App
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium py-1 text-muted hover:text-text transition-colors"
            >
              Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium py-1 text-muted hover:text-text transition-colors"
            >
              FAQ
            </a>
            <hr className="border-border my-2" />
            <div className="flex flex-col gap-3">
              <Link
                href={session ? "/dashboard" : "/auth/login"}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-surface2 transition-colors"
              >
                {session ? "Go to Dashboard" : "Sign In"}
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 rounded-lg bg-amber text-bg text-sm font-semibold hover:bg-amber/90 transition-colors shadow-lg shadow-amber/10 flex items-center justify-center gap-1.5"
              >
                Try Studenv <Globe className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setDesktopModalOpen(true);
                }}
                className="w-full text-center py-2.5 rounded-lg bg-surface2 border border-border2 text-sm font-medium hover:bg-surface3 transition-colors flex items-center justify-center gap-1.5"
              >
                Download Desktop App <Download className="w-4 h-4 text-amber" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-20 pb-16 sm:pb-24 lg:pt-32 lg:pb-32 z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/20 bg-amber/5 text-amber text-xs font-semibold mb-6 animate-pulse">
            <Laptop className="w-3.5 h-3.5" />
            <span>Desktop App Coming Soon • Web App Live</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight font-display text-white max-w-4xl mx-auto leading-none mb-6">
            Your Online Study Environment, <br />
            <span className="bg-gradient-to-r from-amber via-[#ffd18c] to-purple-400 bg-clip-text text-transparent">
              Supercharged by AI.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-xl text-muted max-w-2xl mx-auto leading-relaxed mb-10">
            Collect articles, import PDFs, extract YouTube transcripts, write clean markdown notes, and study with peers in real-time study rooms. Speed of a native desktop app, convenience of the web.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-4">
            <Link
              href="/dashboard"
              className="min-w-[200px] sm:w-auto px-8 py-4 rounded-xl bg-amber hover:bg-amber/90 text-bg text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-amber/20 flex items-center justify-center gap-2 group"
            >
              Try Studenv Online
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button
              type="button"
              onClick={() => setDesktopModalOpen(true)}
              className="min-w-[233px] sm:w-auto px-8 py-4 rounded-xl bg-surface border border-border2 hover:border-amber/40 hover:bg-surface2 text-white text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5 text-amber" />
              Download for Windows
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber/10 text-amber border border-amber/20 ml-1">
                Soon
              </span>
            </button>
          </div>

          {/* Subtext */}
          <p className="text-xs text-muted2 mb-16">
            Windows desktop installer is in preparation. Complete platform is accessible directly on the web.
          </p>
        </div>

        {/* INTERACTIVE SHOWCASE FRAME */}
        <div className="relative max-w-5xl mx-auto border border-border2/80 rounded-2xl bg-surface/90 shadow-2xl overflow-hidden backdrop-blur-md">
          {/* Top window bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-surface2/60">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red/80" />
              <span className="w-3 h-3 rounded-full bg-amber/80" />
              <span className="w-3 h-3 rounded-full bg-green/80" />
            </div>
            <div className="text-xs font-mono text-muted flex items-center gap-1.5 bg-bg/50 px-3 py-1 rounded-md border border-border/60">
              <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              studenv-app-live-preview
            </div>
            <div className="w-14" /> {/* spacer */}
          </div>

          {/* Tab selector */}
          <div className="flex border-b border-border/60 bg-surface">
            <button
              onClick={() => setActiveTab("vault")}
              className={`flex-1 py-3.5 px-4 text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition-all ${activeTab === "vault"
                ? "border-amber text-amber bg-surface2/30"
                : "border-transparent text-muted hover:text-text hover:bg-surface2/10"
                }`}
            >
              <FileText className="w-4 h-4" />
              Knowledge Vault
            </button>
            <button
              onClick={() => setActiveTab("ai")}
              className={`flex-1 py-3.5 px-4 text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition-all ${activeTab === "ai"
                ? "border-amber text-amber bg-surface2/30"
                : "border-transparent text-muted hover:text-text hover:bg-surface2/10"
                }`}
            >
              <Sparkles className="w-4 h-4" />
              AI Assistant Chat
            </button>
            <button
              onClick={() => setActiveTab("rooms")}
              className={`flex-1 py-3.5 px-4 text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition-all ${activeTab === "rooms"
                ? "border-amber text-amber bg-surface2/30"
                : "border-transparent text-muted hover:text-text hover:bg-surface2/10"
                }`}
            >
              <Users className="w-4 h-4" />
              Collaborative Study Rooms
            </button>
          </div>

          {/* Interactive display area */}
          <div className="min-h-[440px] p-6 bg-bg/50 flex flex-col justify-between">

            {/* VAULT PREVIEW */}
            {activeTab === "vault" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/40 pb-4">
                  <div>
                    <h4 className="text-base font-semibold text-white">Your Personal Knowledge Vault</h4>
                    <p className="text-xs text-muted">Click a resource card to view metadata and simulated options.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted bg-surface/60 border border-border/80 px-2.5 py-1 rounded">
                    Storage: 24 / 200 items (Free)
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      id: "calculus",
                      title: "Calculus Foundations & Limits.pdf",
                      type: "pdf",
                      tag: "#math",
                      size: "4.8 MB",
                      progress: 75,
                      desc: "Comprehensive review of limits, derivative rules, and integral approximations.",
                    },
                    {
                      id: "react",
                      title: "React 19 Server Components Tutorial",
                      type: "video",
                      tag: "#webdev",
                      duration: "24:15",
                      progress: 40,
                      desc: "Imported Youtube video. AI extracted transcript of 4,200 words ready.",
                    },
                    {
                      id: "notes",
                      title: "Product Launch Strategy Plan",
                      type: "note",
                      tag: "#business",
                      words: "850 words",
                      progress: 100,
                      desc: "Personal markdown note detailing phase 1 milestones and budget limits.",
                    },
                  ].map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedVaultItem(selectedVaultItem === item.id ? null : item.id)}
                      className={`border rounded-xl p-4 bg-surface/40 hover:bg-surface/80 transition-all cursor-pointer ${selectedVaultItem === item.id ? "border-amber ring-1 ring-amber/30" : "border-border/60"
                        }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {item.type === "pdf" && <FileText className="w-4 h-4 text-red-400" />}
                          {item.type === "video" && <Play className="w-4 h-4 text-blue" />}
                          {item.type === "note" && <FileText className="w-4 h-4 text-amber" />}
                          <span className="text-xs font-mono text-muted bg-surface2/60 px-1.5 py-0.5 rounded border border-border/40">
                            {item.tag}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted font-mono">{item.size || item.duration || item.words}</span>
                      </div>

                      <h5 className="text-sm font-semibold text-white line-clamp-1 mb-1">{item.title}</h5>
                      <p className="text-xs text-muted line-clamp-2 mb-4">{item.desc}</p>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-mono text-muted">
                          <span>Progress</span>
                          <span>{item.progress}%</span>
                        </div>
                        <div className="h-1 bg-border/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber to-amber/60 rounded-full transition-all duration-500"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>

                      {selectedVaultItem === item.id && (
                        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs animate-in fade-in duration-200">
                          <span className="text-amber font-medium flex items-center gap-1">
                            Ask AI <Sparkles className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-muted hover:text-white transition-colors flex items-center gap-0.5">
                            Open item <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI ASSISTANT PREVIEW */}
            {activeTab === "ai" && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <div>
                      <h4 className="text-base font-semibold text-white">AI Assistant</h4>
                      <p className="text-xs text-muted">Ask questions directly in context of your vault.</p>
                    </div>
                  </div>
                  <div className="text-xs text-muted bg-surface/50 border border-border2 px-2.5 py-1 rounded-md flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    Document Context: <strong className="text-white font-medium">Calculus Foundations.pdf</strong>
                  </div>
                </div>

                <div className="border border-border/60 rounded-xl bg-surface/20 p-4 space-y-4 max-h-[280px] overflow-y-auto font-sans text-sm">
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full bg-surface3 flex items-center justify-center text-xs font-bold text-muted border border-border2">
                      U
                    </div>
                    <div className="bg-surface2/60 border border-border/60 rounded-xl p-3 max-w-[85%] text-text text-xs">
                      What are the main applications of limits mentioned in Chapter 1?
                    </div>
                  </div>

                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center text-xs font-bold text-amber">
                      AI
                    </div>
                    <div className="bg-surface/60 border border-border2/60 rounded-xl p-3 max-w-[85%] text-text text-xs leading-relaxed space-y-2">
                      <p>According to Chapter 1 of <strong className="text-amber">Calculus Foundations.pdf</strong>, limits are primarily used for:</p>
                      <ul className="list-disc pl-4 space-y-1 text-muted">
                        <li>Determining the <strong className="text-white">Instantaneous Rate of Change</strong> of a function (which defines the derivative).</li>
                        <li>Finding the <strong className="text-white">Slope of a Tangent Line</strong> to a curve at any specific point.</li>
                        <li>Evaluating <strong className="text-white">Infinite Sums</strong> and approximating the area under a curve.</li>
                      </ul>
                      <p className="text-[10px] text-purple-400 flex items-center gap-1 font-mono pt-1">
                        Source matched: Page 14, Paragraph 3 <Check className="w-3 h-3" />
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 border border-border/60 rounded-xl bg-surface/50 p-2">
                  <input
                    type="text"
                    placeholder="Ask the AI a question about your files..."
                    className="flex-1 bg-transparent border-0 py-2 text-xs focus:ring-0 text-text outline-none px-2"
                    readOnly
                  />
                  <button className="bg-amber hover:bg-amber/90 text-bg px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all">
                    Send <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STUDY ROOMS PREVIEW */}
            {activeTab === "rooms" && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div>
                    <h4 className="text-base font-semibold text-white">Study Room: #algorithms-midterm</h4>
                    <p className="text-xs text-muted">Join collaborative audio/video channels with shared canvases.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-green font-mono bg-green/10 border border-green/20 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green animate-ping" />
                      Live (4 online)
                    </span>
                    <span className="flex items-center gap-1 text-xs text-amber font-mono bg-amber/5 border border-amber/20 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" />
                      23:14 left
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {[
                    { name: "Sophia", role: "Host", avatar: "S", speaking: true, video: true },
                    { name: "Marcus", role: "Student", avatar: "M", speaking: false, video: false },
                    { name: "You (Web)", role: "Presenter", avatar: "Y", speaking: false, video: true },
                    { name: "David", role: "Student", avatar: "D", speaking: false, video: false },
                  ].map((user, idx) => (
                    <div
                      key={idx}
                      className={`relative rounded-xl border p-3 flex flex-col items-center justify-center aspect-video ${user.speaking ? "border-green bg-green/5" : "border-border/60 bg-surface/20"
                        }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-surface3 border border-border/80 flex items-center justify-center font-bold text-sm text-white mb-2">
                        {user.avatar}
                      </div>
                      <span className="text-xs font-semibold text-white">{user.name}</span>
                      <span className="text-[9px] text-muted font-mono">{user.role}</span>

                      {/* Speaking indicator */}
                      {user.speaking && (
                        <div className="absolute top-2 right-2 flex items-center gap-0.5">
                          <span className="w-1 h-3.5 bg-green rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                          <span className="w-1 h-2 bg-green rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                          <span className="w-1 h-3.5 bg-green rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border border-border/60 rounded-xl bg-surface/40 p-3.5 flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-teal" />
                    <span>Active Shared Whiteboard: <strong className="text-white font-medium">B-Trees & Heap Operations</strong></span>
                  </div>
                  <button className="text-xs border border-border hover:border-amber/40 hover:bg-surface px-3 py-1.5 rounded-lg text-white font-medium transition-colors">
                    Join Session Canvas
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* DETAILED FEATURES SECTION */}
      <section id="features" className="py-20 sm:py-28 border-t border-border/40 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
            <h2 className="text-xs font-mono uppercase tracking-widest text-amber mb-3">Core Capabilities</h2>
            <h3 className="text-3xl sm:text-5xl font-bold font-display text-white mb-4">
              Everything you need to learn, organize, and excel.
            </h3>
            <p className="text-base sm:text-lg text-muted">
              Studenv bridges personal knowledge capture and real-time collaboration. Build a vault that grows with you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="group p-6 rounded-2xl border border-border bg-surface/30 hover:bg-surface2/40 hover:border-amber/20 transition-all duration-300 hover:translate-y-[-2px] flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-surface/80 border border-border2/80 flex items-center justify-center shadow-md">
                    {feat.icon}
                  </div>
                  <h4 className="text-lg font-bold text-white group-hover:text-amber transition-colors">{feat.title}</h4>
                  <p className="text-sm text-muted leading-relaxed">{feat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY DOWLOAD DESKTOP APP SECTION */}
      <section id="desktop" className="py-20 sm:py-28 border-t border-border/40 bg-surface/10 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-16 items-center">

            <div className="space-y-6 sm:space-y-8">
              <div>
                <h2 className="text-xs font-mono uppercase tracking-widest text-amber mb-3">Native Windows Desktop App</h2>
                <h3 className="text-3xl sm:text-5xl font-bold font-display text-white mb-4 leading-tight">
                  Maximize speed. Eliminate latency. Learn offline.
                </h3>
                <p className="text-base text-muted leading-relaxed">
                  While our web application is fully-featured, the native desktop app is designed for long, distraction-free study sessions. Built as a desktop-optimized package, it leverages native resources for unmatched response times.
                </p>
              </div>

              <div className="space-y-4 font-sans text-sm">
                {[
                  {
                    title: "No Network Firewall Prompts",
                    desc: "Runs completely in local user space. Safe, sandboxed, and requires no administrative rights or firewall permissions.",
                  },
                  {
                    title: "ASAR-Packed Lightning Fast Install",
                    desc: "Installs in seconds. Uses bundled application archives to compress assets, preventing slow file copies during setup.",
                  },
                  {
                    title: "Local Database & Offline Mode",
                    desc: "Access your files, note revisions, and flashcards even during transit or poor internet connections. Auto-syncs later.",
                  },
                  {
                    title: "Dedicated Taskbar & Window Control",
                    desc: "Featuring the official Studenv logo branding. Runs in its own dedicated window context away from browser tabs.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <ShieldCheck className="w-5 h-5 text-amber" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">{item.title}</h4>
                      <p className="text-muted text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setDesktopModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-amber hover:bg-amber/90 text-bg px-6 py-3.5 rounded-xl font-bold text-sm shadow-xl shadow-amber/15 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Download className="w-4 h-4" /> Download Windows Installer
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-bg/20 text-bg border border-bg/30 ml-1">
                    Soon
                  </span>
                </button>
              </div>
            </div>

            {/* Desktop Mockup graphic */}
            <div className="relative p-2 border border-border2/80 rounded-2xl bg-bg shadow-2xl overflow-hidden max-w-lg mx-auto w-full">
              <div className="absolute inset-0 bg-gradient-to-tr from-amber/10 via-transparent to-purple-500/10 opacity-70 pointer-events-none" />
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/80 bg-surface2/60">
                <div className="flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-amber" />
                  <span className="text-[10px] font-mono text-muted">Studenv Desktop (Windows)</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-border2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-border2" />
                  <span className="w-1.5 h-1.5 rounded-full bg-border2" />
                </div>
              </div>

              {/* Graphic showing the app on desktop */}
              <div className="bg-surface/40 p-6 aspect-[4/3] flex flex-col justify-between relative z-10">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5">
                    <div className="h-4 w-24 bg-white/10 rounded" />
                    <div className="h-3 w-40 bg-white/5 rounded" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-amber/10 border border-amber/30 flex items-center justify-center text-xs font-bold text-amber">
                    S
                  </div>
                </div>

                <div className="space-y-4 my-auto">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-border">
                      <Zap className="w-5 h-5 text-amber" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white">Local Indexing Done</h5>
                      <p className="text-[10px] text-muted">Offline notes index complete (1,402 terms)</p>
                    </div>
                  </div>

                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-amber w-full rounded-full" />
                  </div>
                </div>

                <div className="border border-border/40 bg-bg/60 p-2.5 rounded-lg flex items-center justify-between text-[10px] text-muted">
                  <span>Connection: Secure (Local Sync Engine)</span>
                  <span className="text-green font-mono">● Online</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* PLANS & PRICING SECTION */}
      <section id="pricing" className="py-20 sm:py-28 border-t border-border/40 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
            <h2 className="text-xs font-mono uppercase tracking-widest text-amber mb-3">Pricing Plans</h2>
            <h3 className="text-3xl sm:text-5xl font-bold font-display text-white mb-4">
              Flexible options for every learning tier.
            </h3>
            <p className="text-base sm:text-lg text-muted">
              Start building your knowledge vault for free. Upgrade whenever you need advanced AI limits or group features.
            </p>

            {/* Pricing Cycle Toggle */}
            <div className="mt-8 inline-flex items-center p-1 rounded-xl bg-surface border border-border">
              <button
                onClick={() => setPricingCycle("monthly")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${pricingCycle === "monthly" ? "bg-amber text-bg shadow-sm" : "text-muted hover:text-white"
                  }`}
              >
                Monthly billing
              </button>
              <button
                onClick={() => setPricingCycle("yearly")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${pricingCycle === "yearly" ? "bg-amber text-bg shadow-sm" : "text-muted hover:text-white"
                  }`}
              >
                Yearly billing
                <span className="text-[9px] bg-bg text-amber px-1.5 py-0.5 rounded font-bold font-mono">
                  -20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">

            {/* Starter Plan */}
            <div className="border border-border bg-surface/20 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h4 className="text-base font-mono uppercase tracking-wider text-muted mb-2">Starter</h4>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold text-white">{pricing[pricingCycle].starter}</span>
                  <span className="text-xs text-muted">/ month</span>
                </div>
                <p className="text-xs text-muted leading-relaxed mb-6">
                  Perfect for individual self-learners looking to organize notes and basic files.
                </p>
                <hr className="border-border/60 mb-6" />
                <ul className="space-y-3.5 text-xs text-text">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Up to 200 vault items</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Up to 50 custom tags</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Standard AI Assistant</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Web application access</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-muted line-through">
                    <X className="w-4 h-4 text-muted2 flex-shrink-0" />
                    <span>Desktop App executable download</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="w-full text-center block py-2.5 rounded-lg border border-border hover:border-amber/50 hover:bg-surface/50 text-xs font-semibold transition-all"
                >
                  Start For Free
                </Link>
              </div>
            </div>

            {/* Student Pro Plan */}
            <div className="border-2 border-amber bg-surface/50 rounded-2xl p-6 flex flex-col justify-between relative shadow-xl shadow-amber/5">
              <span className="absolute top-0 right-6 -translate-y-1/2 bg-amber text-bg text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
                Most Popular
              </span>
              <div>
                <h4 className="text-base font-mono uppercase tracking-wider text-amber mb-2">Student Pro</h4>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold text-white">{pricing[pricingCycle].student}</span>
                  <span className="text-xs text-muted">/ month</span>
                </div>
                <p className="text-xs text-muted leading-relaxed mb-6">
                  For students and research professionals seeking unlimited library capacity and desktop integration.
                </p>
                <hr className="border-border/60 mb-6" />
                <ul className="space-y-3.5 text-xs text-text">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span><strong>Unlimited</strong> vault items</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span><strong>Unlimited</strong> custom tags</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Advanced Gemini Pro AI model</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span><strong>Web + Windows Desktop App</strong></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Create & host study rooms</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="w-full text-center block py-2.5 rounded-lg bg-amber hover:bg-amber/90 text-bg text-xs font-semibold transition-all shadow-md shadow-amber/10"
                >
                  Get Student Pro
                </Link>
                <span className="text-[10px] text-muted text-center block mt-2">
                  Free student verification available via university email
                </span>
              </div>
            </div>

            {/* Lab/Team Plan */}
            <div className="border border-border bg-surface/20 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h4 className="text-base font-mono uppercase tracking-wider text-muted mb-2">Lab / Team</h4>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold text-white">{pricing[pricingCycle].team}</span>
                  <span className="text-xs text-muted">/ month</span>
                </div>
                <p className="text-xs text-muted leading-relaxed mb-6">
                  Best for study cohorts, lab labs, and collaborative educational clubs.
                </p>
                <hr className="border-border/60 mb-6" />
                <ul className="space-y-3.5 text-xs text-text">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Everything in Student Pro</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Up to 20 users per active study room</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Shared group vaults (up to 5 workspaces)</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Administrative member controls</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-amber flex-shrink-0" />
                    <span>Priority AI assistant quota</span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href="/dashboard"
                  className="w-full text-center block py-2.5 rounded-lg border border-border hover:border-amber/50 hover:bg-surface/50 text-xs font-semibold transition-all"
                >
                  Contact Sales / Create Lab
                </Link>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-20 sm:py-28 border-t border-border/40 bg-surface/5 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-mono uppercase tracking-widest text-amber mb-3">Frequently Asked Questions</h2>
            <h3 className="text-3xl font-bold font-display text-white mb-4">
              Got questions? We have answers.
            </h3>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-border/60 rounded-xl bg-surface/30 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex items-center justify-between p-5 text-left text-sm font-semibold text-white hover:bg-surface2/10 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted transition-transform duration-200 ${faqOpen === idx ? "transform rotate-180" : ""
                      }`}
                  />
                </button>
                {faqOpen === idx && (
                  <div className="p-5 pt-0 text-xs text-muted leading-relaxed border-t border-border/20 animate-in fade-in slide-in-from-top-1 duration-150">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* BOTTOM CTA BANNER */}
      <section className="py-20 sm:py-28 border-t border-border/40 relative overflow-hidden z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,166,35,0.04),transparent_60%)] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">

          <h2 className="text-3xl sm:text-5xl font-bold font-display text-white mb-6 tracking-tight leading-tight">
            Start building your personal knowledge vault today.
          </h2>
          <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            Unleash the power of context-aware artificial intelligence. Read books, watch lectures, write summaries, and share insights in real-time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-amber hover:bg-amber/90 text-bg text-sm font-semibold shadow-lg shadow-amber/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Get Started for Free
            </Link>
            <button
              type="button"
              onClick={() => setDesktopModalOpen(true)}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-surface border border-border2 hover:border-amber/30 hover:bg-surface2 text-white text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 text-amber" />
              Download Desktop App
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber/10 text-amber border border-amber/20 ml-1">
                Soon
              </span>
            </button>
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/40 bg-surface/30 py-12 relative z-10 text-xs text-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <BrandLockup variant="mark" className="flex items-center gap-2 font-bold text-white text-sm" />
            <span className="text-[10px] text-muted2 border-l border-border/60 pl-2">
              © {new Date().getFullYear()} Studenv Inc. All rights reserved.
            </span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#features" className="hover:text-text transition-colors">Features</a>
            <a href="#desktop" className="hover:text-text transition-colors">Desktop</a>
            <a href="#pricing" className="hover:text-text transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-text transition-colors">FAQ</a>
            <Link href="/auth/login" className="hover:text-text transition-colors">Dashboard Sign In</Link>
          </div>
        </div>
      </footer>

      {/* Desktop App Coming Soon Modal */}
      {desktopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-border2 bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setDesktopModalOpen(false)}
              className="absolute top-4 right-4 text-muted hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber/10 text-amber mb-4">
              <Laptop className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Desktop App Coming Soon</h3>
            <p className="text-sm text-muted mb-6 leading-relaxed">
              The standalone Windows desktop installer is currently being prepared for GitHub Releases and is not yet available for direct download. You can access the complete Studenv platform right now directly in your browser.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/dashboard"
                onClick={() => setDesktopModalOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber hover:bg-amber/90 text-bg text-sm font-semibold text-center transition-all flex items-center justify-center gap-2"
              >
                Launch Web App <Globe className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setDesktopModalOpen(false)}
                className="py-2.5 px-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 text-white text-sm font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
