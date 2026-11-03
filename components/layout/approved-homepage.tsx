"use client";
import { useEffect } from "react";
import approvedHomepageMarkup from "./approved-homepage-content";
export function ApprovedHomepage() {
 useEffect(() => {
  const root=document.querySelector<HTMLElement>(".approved-homepage"); if(!root)return;
  const menuButton=root.querySelector<HTMLButtonElement>("#menuBtn");
  const mobilePanel=root.querySelector<HTMLElement>("#mobilePanel");
  const handleMenuClick=()=>{if(!menuButton||!mobilePanel)return;mobilePanel.classList.toggle("open");menuButton.setAttribute("aria-expanded",String(mobilePanel.classList.contains("open")));};
  const sectionTarget=(id:string)=>{const aliases:Record<string,string>={shelf:"features",focus:"supporting-tools",planner:"supporting-tools",achievements:"supporting-tools"};return root.querySelector<HTMLElement>(`#${CSS.escape(aliases[id]??id)}`);};
  const scrollToSection=(target:HTMLElement)=>{const header=root.querySelector<HTMLElement>(".topbar");const offset=header?.getBoundingClientRect().height??76;const top=target.getBoundingClientRect().top+window.scrollY-offset;window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});};
  const closeNavigation=()=>{if(mobilePanel&&menuButton){mobilePanel.classList.remove("open");menuButton.setAttribute("aria-expanded","false");}const featureToggle=root.querySelector<HTMLAnchorElement>(".feature-nav > a[aria-haspopup]");featureToggle?.setAttribute("aria-expanded","false");};
  const handleClick=(event:MouseEvent)=>{const target=event.target;if(!(target instanceof Element))return;if(target.closest("#menuBtn")){handleMenuClick();return;}const anchor=target.closest<HTMLAnchorElement>("a[href^=\"#\"]");if(anchor&&root.contains(anchor)){const href=anchor.getAttribute("href")??"";if(href.startsWith("#/")){closeNavigation();}else{const id=decodeURIComponent(href.slice(1));const destination=sectionTarget(id);if(destination){event.preventDefault();closeNavigation();const onSubpage=["#/about","#/faq","#/contact","#/privacy","#/terms"].includes(window.location.hash);if(onSubpage){window.location.hash=href;}else{if(window.location.hash!==href)window.history.pushState(null,"",href);scrollToSection(destination);}}}}const faq=target.closest<HTMLButtonElement>(".faq-question");if(faq&&root.contains(faq)){const item=faq.closest<HTMLElement>(".faq-item");item?.classList.toggle("open");const isOpen=!!item?.classList.contains("open");faq.setAttribute("aria-expanded",String(isOpen));const answer=item?.querySelector<HTMLElement>(".faq-answer");answer?.setAttribute("aria-hidden",String(!isOpen));const mark=faq.querySelector<HTMLElement>("span:last-child");if(mark)mark.textContent=isOpen?"−":"＋";}const link=target.closest<HTMLAnchorElement>("#mobilePanel a");if(link&&mobilePanel&&menuButton){mobilePanel.classList.remove("open");menuButton.setAttribute("aria-expanded","false");}};
  const handleSubmit=(event:SubmitEvent)=>{const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=="contactForm")return;event.preventDefault();const status=root.querySelector<HTMLElement>("#formStatus");if(status){status.textContent="Thank you — the form design is working. Message delivery will be enabled when the contact backend is connected.";status.classList.add("show");}};
  const route=()=>{const key=(window.location.hash.match(/^#\/(about|faq|contact|privacy|terms)$/)||[])[1];root.querySelectorAll<HTMLElement>(".page-view").forEach(v=>v.classList.remove("active"));const home=root.querySelector<HTMLElement>("#top");if(key){if(home)home.style.display="none";root.querySelector<HTMLElement>(`#page-${key}`)?.classList.add("active");window.scrollTo(0,0);const titles:Record<string,string>={about:"About Studenv",faq:"Frequently Asked Questions",contact:"Contact Studenv",privacy:"Privacy Policy",terms:"Terms of Service"};document.title=`${titles[key]} — Studenv`;}else{if(home)home.style.display="";document.title="Studenv — Your knowledge deserves a home";if(window.location.hash&&window.location.hash!=="#top"){window.setTimeout(()=>{const id=decodeURIComponent(window.location.hash.slice(1));const destination=sectionTarget(id);if(destination)scrollToSection(destination);},40);}else window.scrollTo(0,0);}};
  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
   observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
     if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer?.unobserve(entry.target);
     }
    });
   }, { threshold: 0.1 });
  }
  root.addEventListener("click",handleClick);root.addEventListener("submit",handleSubmit);window.addEventListener("hashchange",route);const fadeElements=Array.from(root.querySelectorAll<HTMLElement>(".fade"));const revealVisibleFades=()=>{fadeElements.forEach(el=>{const rect=el.getBoundingClientRect();if(rect.bottom>=0&&rect.top<=window.innerHeight){el.classList.add("visible");observer?.unobserve(el);}});};fadeElements.forEach(el=>observer?observer.observe(el):el.classList.add("visible"));window.addEventListener("resize",revealVisibleFades,{passive:true});window.addEventListener("pageshow",revealVisibleFades);route();revealVisibleFades();
  return()=>{root.removeEventListener("click",handleClick);root.removeEventListener("submit",handleSubmit);window.removeEventListener("hashchange",route);window.removeEventListener("resize",revealVisibleFades);window.removeEventListener("pageshow",revealVisibleFades);observer?.disconnect();};
 },[]);
 return <div className="approved-homepage" dangerouslySetInnerHTML={{__html:approvedHomepageMarkup}} />;
}