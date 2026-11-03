"use client";
import { useEffect } from "react";
import approvedHomepageMarkup from "./approved-homepage-content";
export function ApprovedHomepage() {
 useEffect(() => {
  const root=document.querySelector<HTMLElement>(".approved-homepage"); if(!root)return;
  const menuButton=root.querySelector<HTMLButtonElement>("#menuBtn");
  const mobilePanel=root.querySelector<HTMLElement>("#mobilePanel");
  const handleMenuClick=()=>{if(!menuButton||!mobilePanel)return;mobilePanel.classList.toggle("open");menuButton.setAttribute("aria-expanded",String(mobilePanel.classList.contains("open")));};
  const handleClick=(event:MouseEvent)=>{const target=event.target;if(!(target instanceof Element))return;const faq=target.closest<HTMLButtonElement>(".faq-question");if(faq&&root.contains(faq)){const item=faq.closest<HTMLElement>(".faq-item");item?.classList.toggle("open");const mark=faq.querySelector<HTMLElement>("span:last-child");if(mark)mark.textContent=item?.classList.contains("open")?"−":"＋";}const link=target.closest<HTMLAnchorElement>("#mobilePanel a");if(link&&mobilePanel&&menuButton){mobilePanel.classList.remove("open");menuButton.setAttribute("aria-expanded","false");}};
  const handleSubmit=(event:SubmitEvent)=>{const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=="contactForm")return;event.preventDefault();const status=root.querySelector<HTMLElement>("#formStatus");if(status){status.textContent="Thank you — the form design is working. Message delivery will be enabled when the contact backend is connected.";status.classList.add("show");}};
  const route=()=>{const key=(window.location.hash.match(/^#\/(about|faq|contact|privacy|terms)$/)||[])[1];root.querySelectorAll<HTMLElement>(".page-view").forEach(v=>v.classList.remove("active"));const home=root.querySelector<HTMLElement>("#top");if(key){if(home)home.style.display="none";root.querySelector<HTMLElement>(`#page-${key}`)?.classList.add("active");window.scrollTo(0,0);const titles:Record<string,string>={about:"About Studenv",faq:"Frequently Asked Questions",contact:"Contact Studenv",privacy:"Privacy Policy",terms:"Terms of Service"};document.title=`${titles[key]} — Studenv`;}else{if(home)home.style.display="";document.title="Studenv — Your knowledge deserves a home";if(window.location.hash&&window.location.hash!=="#top"){window.setTimeout(()=>root.querySelector<HTMLElement>(window.location.hash)?.scrollIntoView({behavior:"smooth",block:"start"}),40);}else window.scrollTo(0,0);}};
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
  menuButton?.addEventListener("click",handleMenuClick);root.addEventListener("click",handleClick);root.addEventListener("submit",handleSubmit);window.addEventListener("hashchange",route);root.querySelectorAll<HTMLElement>(".fade").forEach(el=>observer?observer.observe(el):el.classList.add("visible"));route();
  return()=>{menuButton?.removeEventListener("click",handleMenuClick);root.removeEventListener("click",handleClick);root.removeEventListener("submit",handleSubmit);window.removeEventListener("hashchange",route);observer?.disconnect();};
 },[]);
 return <div className="approved-homepage" dangerouslySetInnerHTML={{__html:approvedHomepageMarkup}} />;
}