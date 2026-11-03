"use client";

import { useState } from "react";
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Focus,
  Layers3,
  Library,
  Menu,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { BrandLockup } from "@/components/ui/brand-logo";

interface LandingPageProps {
  session: any;
}

const faqs = [
  {
    q: "What is Studenv?",
    a: "Studenv is a personal learning environment: a place to collect resources, organize your thoughts, and return to what you have learned.",
  },
  {
    q: "Is Studenv only for students?",
    a: "No. It is designed for anyone who learns independently — students, curious minds, researchers, and people who work with information every day.",
  },
  {
    q: "What can I keep in my Shelf?",
    a: "Shelf brings learning resources together, including documents, links, videos, images, and your own notes.",
  },
  {
    q: "What is the Workspace for?",
    a: "Workspace is a visual space for arranging notes, resources, diagrams, and ideas on a canvas. You can explore the current Workspace from inside Studenv.",
  },
  {
    q: "Is Rangan available now?",
    a: "Not yet. Rangan is a planned AI librarian and learning companion. We will share more when it is ready.",
  },
];

const featureLinks = [
  { label: "The Shelf", href: "#shelf", note: "Your learning library" },
  { label: "Workspace", href: "#workspace", note: "Think visually" },
  { label: "Study Groups", href: "#study-groups", note: "Learn together" },
  { label: "Rangan", href: "#rangan", note: "Coming soon" },
  { label: "Focus Mode", href: "#supporting-tools", note: "Protect your attention" },
  { label: "Planner", href: "#supporting-tools", note: "Plan your next step" },
  { label: "Achievements", href: "#supporting-tools", note: "Notice your progress" },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d7a34b]">
      {children}
    </p>
  );
}

function WorkspacePreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#d8d8d3] bg-[#fbfbf9] p-3 text-[#242424] shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-4">
      <div className="flex items-center justify-between border-b border-[#e7e7e2] pb-3 text-[10px] text-[#5f6672]">
        <div className="flex items-center gap-2 font-semibold text-[#252936]">
          <span className="h-2 w-2 rounded-full bg-[#7556e8]" />
          Operating Systems
          <span className="rounded bg-[#eeeaff] px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-[#674bd1]">STUDIO</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#15945d]">● Saved</span>
          <span className="rounded bg-[#6541df] px-2 py-1 font-semibold text-white">Share</span>
        </div>
      </div>
      <div className="grid min-h-[330px] grid-cols-[30px_minmax(0,1fr)_116px] gap-2 pt-3 sm:min-h-[390px] sm:grid-cols-[36px_minmax(0,1fr)_150px] sm:gap-3">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-[#e3e5eb] bg-white py-2 text-[#71809a] shadow-sm">
          <span className="rounded bg-[#eeeaff] p-1 text-[#674bd1]">↖</span>
          <span>✋</span><span className="h-px w-4 bg-[#e6e8ed]" />
          <span>▣</span><span>T</span><span>▧</span><span className="h-px w-4 bg-[#e6e8ed]" />
          <span>□</span><span>◯</span><span>△</span><span>／</span><span>⌁</span>
          <span className="mt-auto">✎</span><span>⌫</span><span>···</span>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-[#e5e7ec] bg-[radial-gradient(#dfe4ee_0.8px,transparent_0.8px)] [background-size:13px_13px]">
          <div className="absolute left-3 top-3 w-[39%] rounded-md border border-[#e2e5ec] bg-white p-2 shadow-md">
            <div className="mb-2 flex items-center justify-between text-[8px] font-semibold text-[#596174]"><span>Operating Systems — Overview</span><Play size={9} /></div>
            <div className="flex aspect-video items-center justify-center rounded bg-[#17132d] text-center text-[11px] font-bold leading-tight text-white">
              <span>OPERATING<br />SYSTEMS</span>
            </div>
          </div>
          <div className="absolute left-1/2 top-[43%] flex h-[74px] w-[112px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[50%] border-2 border-[#7656e8] bg-[#eee9ff] text-center text-[12px] font-bold leading-tight text-[#28223f] shadow-sm sm:h-[86px] sm:w-[140px] sm:text-sm">Operating<br />System</div>
          <div className="absolute left-[52%] top-[15%] h-[2px] w-[18%] rotate-[-25deg] bg-[#242424]" />
          <div className="absolute right-[7%] top-[8%] w-[27%] rounded-md border border-[#b6e2c5] bg-[#effaf2] p-2 text-[9px] font-semibold text-[#253b2c]">Memory Management<div className="mt-1 font-normal leading-relaxed">• Allocation<br />• Paging<br />• Segmentation</div></div>
          <div className="absolute left-[7%] top-[55%] w-[31%] rounded-md border border-[#f0d47b] bg-[#fff7d8] p-2 text-[9px] font-semibold text-[#45391a]">CPU Scheduling<div className="mt-1 font-normal leading-relaxed">• FCFS<br />• SJF<br />• Round Robin</div></div>
          <div className="absolute right-[6%] top-[49%] w-[29%] rounded-md border border-[#c9b8ff] bg-[#f4f0ff] p-2 text-[9px] font-semibold text-[#30244d]">File System<div className="mt-1 font-normal leading-relaxed">• Files<br />• Directories<br />• Permissions</div></div>
          <div className="absolute bottom-[8%] left-[8%] w-[36%] rotate-[-2deg] rounded-sm border border-[#f0e0a0] bg-[#fff2b8] p-2 text-[9px] text-[#38301d] shadow-sm"><strong>Key takeaways</strong><div className="mt-1 leading-relaxed">✓ Manages resources<br />✓ Runs applications</div></div>
          <div className="absolute bottom-[8%] right-[7%] w-[32%] rotate-[2deg] rounded-sm border border-[#d8caff] bg-[#f0eaff] p-2 text-[9px] text-[#352b50] shadow-sm"><strong>Next steps</strong><div className="mt-1 leading-relaxed">□ Revise notes<br />□ Practice questions</div></div>
        </div>
        <aside className="hidden flex-col gap-2 rounded-lg border border-[#e3e5eb] bg-white p-2 sm:flex">
          <div className="flex items-center gap-1 text-[10px] font-bold text-[#263044]"><Library size={11} /> Vault Library</div>
          <div className="rounded border border-[#e7e9ef] px-2 py-1 text-[8px] text-[#8a91a1]"><Search size={9} className="mr-1 inline" /> Search assets</div>
          {["process-scheduling.pdf","memory-management.pdf","os-architecture.png","lecture-part-1.mp4"].map((file, i) => (
            <div key={file} className="flex items-center gap-1.5 rounded border border-[#edf0f4] p-1.5 text-[8px] text-[#374151]">
              <span className={i === 2 ? "text-emerald-600" : i === 3 ? "text-blue-600" : "text-red-500"}>{i === 2 ? "▧" : i === 3 ? "▶" : "▤"}</span>
              <span className="min-w-0 truncate">{file}</span>
            </div>
          ))}
        </aside>
      </div>
      <div className="mt-2 flex items-center justify-between text-[8px] text-[#8a91a1]"><span>−　100%　＋</span><span>Canvas preview</span></div>
    </div>
  );
}

function ShelfPreview() {
  return (
    <div className="rounded-xl border border-[#34312d] bg-[#171614] p-4 shadow-2xl sm:p-5">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#eee7db]"><Library size={16} className="text-[#d7a34b]" /> My Shelf</div>
        <span className="rounded-full border border-[#514536] px-2 py-1 font-mono text-[9px] text-[#c5a66c]">ALL RESOURCES</span>
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#393631] bg-[#11100f] px-3 py-2 text-xs text-[#827b70]"><Search size={13} /> Search your library</div>
      <div className="grid grid-cols-2 gap-3">
        {[["PDF","Discrete Mathematics","12 pages"],["VIDEO","Understanding TCP/IP","18 min"],["NOTE","Ideas & references","Edited today"],["IMAGE","System architecture","PNG image"]].map(([kind,title,meta],i)=>(
          <div key={title} className="rounded-lg border border-[#37332d] bg-[#201e1a] p-3">
            <div className="mb-4 flex items-center justify-between"><span className="rounded bg-[#30291e] px-2 py-1 font-mono text-[8px] text-[#e2b45e]">{kind}</span><span className="text-[10px] text-[#777064]">···</span></div>
            <div className="mb-1 text-xs font-medium text-[#e9e2d6]">{title}</div>
            <div className="text-[10px] text-[#847d72]">{meta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, eyebrow, title, description, href, status }: {
  icon: ElementType; eyebrow: string; title: string; description: string; href: string; status?: string;
}) {
  return (
    <Link href={href} className="group flex min-h-[230px] flex-col rounded-xl border border-[#34312d] bg-[#151412] p-6 transition duration-200 hover:-translate-y-1 hover:border-[#8a6835] hover:bg-[#1b1916]">
      <div className="mb-8 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#51412a] bg-[#2a2115] text-[#d7a34b]"><Icon size={18} /></span>
        {status && <span className="font-mono text-[9px] uppercase tracking-wider text-[#b69b6a]">{status}</span>}
        {!status && <ArrowUpRight size={16} className="text-[#6d675d] transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[#e4b45e]" />}
      </div>
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8b7b5d]">{eyebrow}</p>
      <h3 className="mb-2 font-display text-2xl text-[#f0e9dc]">{title}</h3>
      <p className="text-sm leading-6 text-[#999187]">{description}</p>
    </Link>
  );
}

export default function LandingPage({ session }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const dashboardHref = session ? "/dashboard" : "/auth/login";

  return (
    <main className="min-h-screen overflow-hidden bg-[#10100f] text-[#eee7db] selection:bg-[#d7a34b]/30 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-[#302d28] bg-[#10100f]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Studenv home"><BrandLockup variant="mark" className="gap-3" imageClassName="h-7 w-7" textClassName="text-lg font-semibold tracking-tight text-[#f0e9dc]" /></Link>
          <nav className="hidden items-center gap-8 text-sm text-[#aaa297] lg:flex">
            <div className="group relative">
              <a href="#features" className="inline-flex items-center gap-1 transition hover:text-white">Features <ChevronDown size={13} /></a>
              <div className="invisible absolute left-0 top-full z-50 mt-4 w-64 translate-y-1 rounded-xl border border-[#3a352e] bg-[#181714] p-2 opacity-0 shadow-2xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                {featureLinks.map((item)=><a key={item.label} href={item.href} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-[#25221d]"><span className="text-xs text-[#eee7db]">{item.label}</span><span className="text-[9px] text-[#827a6e]">{item.note}</span></a>)}
              </div>
            </div>
            <a href="#about" className="transition hover:text-white">About</a>
            <a href="#faq" className="transition hover:text-white">FAQs</a>
            <a href="#contact" className="transition hover:text-white">Contact</a>
          </nav>
          <div className="hidden items-center gap-5 lg:flex">
            <Link href={session ? "/dashboard" : "/auth/login"} className="text-sm text-[#c7beb1] transition hover:text-white">{session ? "Open Studenv" : "Sign in"}</Link>
            <Link href={dashboardHref} className="inline-flex items-center gap-2 rounded-md bg-[#d7a34b] px-4 py-2.5 text-sm font-semibold text-[#17130d] transition hover:bg-[#e7b75f]">Get started <ArrowUpRight size={15} /></Link>
          </div>
          <button className="rounded-md border border-[#3a352e] p-2 text-[#eee7db] lg:hidden" onClick={()=>setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
        </div>
        {menuOpen && <div className="border-t border-[#302d28] bg-[#151412] px-5 py-4 lg:hidden">
          {[["Features","#features"],["About","#about"],["FAQs","#faq"],["Contact","#contact"]].map(([label,href])=><a key={label} href={href} onClick={()=>setMenuOpen(false)} className="block border-b border-[#302d28] py-3 text-sm text-[#c9c0b4]">{label}</a>)}
          <Link href={dashboardHref} className="mt-4 inline-flex rounded-md bg-[#d7a34b] px-4 py-2.5 text-sm font-semibold text-[#17130d]">Get started <ArrowUpRight size={15} className="ml-2"/></Link>
        </div>}
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-24 pt-20 sm:px-8 sm:pt-28 lg:pb-32 lg:pt-36">
        <div className="pointer-events-none absolute -right-40 top-10 h-[460px] w-[460px] rounded-full bg-[#b98537]/[0.08] blur-[110px]" />
        <div className="relative grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <div className="max-w-xl">
            <SectionLabel>A personal learning environment</SectionLabel>
            <h1 className="mb-7 font-display text-5xl leading-[1.04] tracking-[-0.045em] text-[#f3ecdf] sm:text-6xl lg:text-[68px]">Your knowledge deserves a <span className="text-[#d7a34b]">home.</span></h1>
            <p className="mb-9 max-w-lg text-base leading-8 text-[#a9a195] sm:text-lg">Collect what you discover. Organize what you learn. Build a second brain that grows with you.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={dashboardHref} className="inline-flex items-center gap-2 rounded-md bg-[#d7a34b] px-5 py-3.5 text-sm font-semibold text-[#17130d] transition hover:bg-[#e7b75f]">Get started <ArrowRight size={16}/></Link>
              <a href="#philosophy" className="inline-flex items-center gap-2 rounded-md border border-[#494239] px-5 py-3.5 text-sm font-medium text-[#e3dbcf] transition hover:border-[#8d7044] hover:bg-white/[0.03]">Explore Studenv <ArrowDownRight size={15}/></a>
            </div>
            <p className="mt-5 font-mono text-[10px] tracking-wide text-[#716b61]">A quieter place for everything you are learning.</p>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-2xl bg-[#d7a34b]/[0.06] blur-2xl" />
            <div className="relative"><WorkspacePreview /></div>
            <div className="absolute -bottom-5 -left-5 hidden w-44 rounded-lg border border-[#39342c] bg-[#191714] p-3 shadow-xl sm:block"><p className="font-mono text-[9px] uppercase tracking-wider text-[#b89a65]">Keep it connected</p><p className="mt-1 text-xs leading-5 text-[#d8d0c4]">Resources, notes, and ideas — together.</p></div>
          </div>
        </div>
      </section>

      <section id="philosophy" className="border-y border-[#302d28] bg-[#151412] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
          <div><SectionLabel>Why Studenv exists</SectionLabel><h2 className="font-display text-4xl leading-tight tracking-tight text-[#f0e9dc] sm:text-5xl">Learning leaves traces. Give them somewhere to live.</h2></div>
          <div><p className="mb-10 max-w-2xl text-base leading-8 text-[#aaa297]">Learning happens everywhere — in a classroom, through a video, in an article, a passing thought or a document worth keeping. Your notes, ideas and discoveries deserve more than scattered tabs and forgotten files. Studenv gives everything you learn a place to come together.</p>
            <div className="grid gap-7 border-t border-[#39342d] pt-7 sm:grid-cols-3">
              {[["01 / CAPTURE","Stop losing the good stuff.","Keep class notes, useful resources, references and ideas close instead of letting them disappear into tabs and scattered files."],["02 / ORGANIZE","Make sense of what you keep.","Bring structure to your growing collection with tags, collections, personal notes and dedicated workspaces."],["03 / GROW","Make learning cumulative.","Revisit what matters, pick up where you left off, and build on your knowledge over time."]].map(([n,t,d])=><div key={n}><p className="mb-3 font-mono text-[9px] tracking-[0.16em] text-[#b18c50]">{n}</p><h3 className="mb-2 text-base font-semibold text-[#eee7db]">{t}</h3><p className="text-sm leading-6 text-[#918a80]">{d}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-14 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><SectionLabel>Made to work together</SectionLabel><h2 className="max-w-2xl font-display text-4xl tracking-tight text-[#f0e9dc] sm:text-5xl">A home for every part of learning.</h2></div><p className="max-w-sm text-sm leading-7 text-[#989187]">Not another place to collect tabs. A connected environment for the things you discover and the work you do with them.</p></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <article id="shelf" className="grid gap-7 overflow-hidden rounded-xl border border-[#34312d] bg-[#151412] p-6 sm:grid-cols-[0.9fr_1.1fr] sm:p-8"><div className="flex flex-col justify-between"><div><span className="font-mono text-[9px] tracking-[0.18em] text-[#b18c50]">01 — THE SHELF</span><h3 className="mb-3 mt-4 font-display text-3xl text-[#f0e9dc]">Keep what matters.</h3><p className="text-sm leading-7 text-[#999187]">A personal library for the resources you want to return to — documents, links, videos, images, and notes.</p></div><a href="/shelf" className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-[#d7a34b]">Explore Shelf <ArrowUpRight size={14}/></a></div><ShelfPreview /></article>
          <article id="workspace" className="overflow-hidden rounded-xl border border-[#34312d] bg-[#151412] p-6 sm:p-8"><div className="mb-7 flex items-start justify-between gap-5"><div><span className="font-mono text-[9px] tracking-[0.18em] text-[#b18c50]">02 — YOUR WORKSPACE</span><h3 className="mb-3 mt-4 font-display text-3xl text-[#f0e9dc]">Think on the canvas.</h3><p className="max-w-md text-sm leading-7 text-[#999187]">Bring notes, media, diagrams, and ideas into one visual space. Arrange them, connect them, and work things out.</p></div><Layers3 className="mt-1 shrink-0 text-[#d7a34b]" size={22}/></div><WorkspacePreview /></article>
          <article id="study-groups" className="rounded-xl border border-[#34312d] bg-[#151412] p-7 sm:p-8"><div className="mb-7 flex items-center justify-between"><span className="font-mono text-[9px] tracking-[0.18em] text-[#b18c50]">03 — STUDY GROUPS</span><span className="rounded-full border border-[#55442d] px-2.5 py-1 font-mono text-[9px] text-[#b99a67]">IN DEVELOPMENT</span></div><div className="mb-4 flex -space-x-2"><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#151412] bg-[#4c4236] text-xs">A</span><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#151412] bg-[#65516c] text-xs">M</span><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#151412] bg-[#47615d] text-xs">R</span><span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#151412] bg-[#37332d] text-xs">+</span></div><h3 className="mb-3 font-display text-3xl text-[#f0e9dc]">Learning can be shared.</h3><p className="max-w-lg text-sm leading-7 text-[#999187]">A place for focused group learning is part of the wider Studenv vision. We will share more as this experience takes shape.</p></article>
          <article id="rangan" className="relative overflow-hidden rounded-xl border border-[#51432e] bg-[linear-gradient(135deg,#211d17,#171512_65%)] p-7 sm:p-8"><div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[#d7a34b]/[0.09] blur-3xl"/><div className="relative"><div className="mb-7 flex items-center justify-between"><span className="font-mono text-[9px] tracking-[0.18em] text-[#b18c50]">A FUTURE CAPABILITY</span><Sparkles size={20} className="text-[#d7a34b]"/></div><h3 className="mb-2 font-display text-4xl text-[#f0e9dc]">Rangan</h3><p className="mb-4 text-sm font-medium text-[#d7a34b]">Your AI librarian and learning companion.</p><p className="max-w-lg text-sm leading-7 text-[#999187]">A future way to rediscover what you have collected, ask better questions, and connect ideas across your learning. Rangan is coming later — it is not available yet.</p><span className="mt-7 inline-flex rounded-full border border-[#55442d] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[#b99a67]">Coming soon</span></div></article>
        </div>
      </section>

      <section id="supporting-tools" className="border-y border-[#302d28] bg-[#151412] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8"><SectionLabel>Along the way</SectionLabel><div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><h2 className="font-display text-4xl text-[#f0e9dc] sm:text-5xl">Small tools. Better learning habits.</h2><p className="max-w-sm text-sm leading-7 text-[#989187]">Keep your attention, your plans, and your progress close to the work.</p></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[{icon:Focus,title:"Focus Mode",desc:"Give a study session your full attention."},{icon:CalendarDays,title:"Planner",desc:"Turn intentions into manageable next steps."},{icon:Check,title:"Achievements",desc:"See the consistency behind your progress."}].map(({icon:Icon,title,desc})=><div key={title} className="flex gap-4 rounded-lg border border-[#39342d] bg-[#191714] p-5"><Icon className="mt-1 shrink-0 text-[#d7a34b]" size={19}/><div><h3 className="mb-1 text-sm font-semibold text-[#eee7db]">{title}</h3><p className="text-xs leading-6 text-[#918a80]">{desc}</p></div></div>)}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24"><div><SectionLabel>About Studenv</SectionLabel><h2 className="font-display text-4xl leading-tight text-[#f0e9dc] sm:text-5xl">Learning is more than consuming information.</h2></div><div className="max-w-2xl"><p className="text-lg leading-8 text-[#c3baad]">It is collecting, questioning, connecting, forgetting, returning, and making something of what you find.</p><p className="mt-5 text-sm leading-8 text-[#918a80]">Studenv is being built around that longer journey. We want your learning resources and your own thinking to live closer together — so the things you discover today can still be useful tomorrow.</p><a href="#philosophy" className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-[#d7a34b]">Our approach <ArrowUpRight size={14}/></a></div></section>

      <section id="faq" className="border-y border-[#302d28] bg-[#151412] py-20 sm:py-24"><div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24"><div><SectionLabel>Questions, answered</SectionLabel><h2 className="font-display text-4xl text-[#f0e9dc] sm:text-5xl">A few things you might be wondering.</h2></div><div className="border-t border-[#3b352d]">{faqs.map((faq,index)=><div key={faq.q} className="border-b border-[#3b352d]"><button className="flex w-full items-center justify-between gap-5 py-5 text-left text-sm font-medium text-[#e8e0d5]" onClick={()=>setFaqOpen(faqOpen===index?null:index)} aria-expanded={faqOpen===index}><span>{faq.q}</span><ChevronDown size={16} className={faqOpen===index?"rotate-180 text-[#d7a34b] transition":"text-[#81796d] transition"}/></button>{faqOpen===index&&<p className="max-w-2xl pb-5 pr-8 text-sm leading-7 text-[#989187]">{faq.a}</p>}</div>)}</div></div></section>

      <section id="contact" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28"><div className="flex flex-col justify-between gap-8 rounded-xl border border-[#51432e] bg-[linear-gradient(120deg,#211d17,#171512)] p-8 sm:flex-row sm:items-center sm:p-12"><div className="max-w-xl"><SectionLabel>Stay connected</SectionLabel><h2 className="mb-3 font-display text-4xl text-[#f0e9dc] sm:text-5xl">Have a thought about Studenv?</h2><p className="text-sm leading-7 text-[#a29a8e]">We are building this thoughtfully. Sign in to explore the product and follow along as the learning environment grows.</p></div><Link href={dashboardHref} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#d7a34b] px-5 py-3.5 text-sm font-semibold text-[#17130d] transition hover:bg-[#e7b75f]">Explore Studenv <ArrowUpRight size={15}/></Link></div></section>

      <footer className="border-t border-[#302d28] bg-[#0c0c0b]"><div className="mx-auto max-w-7xl px-5 py-12 sm:px-8"><div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]"><div><BrandLockup variant="mark" className="gap-3" imageClassName="h-7 w-7" textClassName="text-lg font-semibold text-[#f0e9dc]"/><p className="mt-4 max-w-xs text-xs leading-6 text-[#81796e]">A personal learning environment for everything you discover and everything you make of it.</p></div><div><p className="mb-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#b18c50]">Product</p>{[["The Shelf","#shelf"],["Workspace","#workspace"],["Study Groups","#study-groups"],["Rangan","#rangan"],["Focus & Planner","#supporting-tools"]].map(([label,href])=><a key={label} href={href} className="mb-3 block text-xs text-[#a49b8e] transition hover:text-white">{label}</a>)}</div><div><p className="mb-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#b18c50]">Company</p>{[["About Studenv","#about"],["FAQs","#faq"],["Contact","#contact"]].map(([label,href])=><a key={label} href={href} className="mb-3 block text-xs text-[#a49b8e] transition hover:text-white">{label}</a>)}</div><div><p className="mb-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#b18c50]">Account</p><Link href="/auth/login" className="mb-3 block text-xs text-[#a49b8e] hover:text-white">Sign in</Link><Link href="/auth/signup" className="mb-3 block text-xs text-[#a49b8e] hover:text-white">Create account</Link><Link href="/dashboard" className="mb-3 block text-xs text-[#a49b8e] hover:text-white">Open Studenv</Link></div></div><div className="mt-12 flex flex-col gap-3 border-t border-[#302d28] pt-6 text-[10px] text-[#716b61] sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Studenv. Built for the long journey of learning.</span><span>Settle in. Stay curious. Keep growing.</span></div></div></footer>
    </main>
  );
}
