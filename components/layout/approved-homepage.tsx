"use client";
import { useEffect } from "react";
import approvedHomepageMarkup from "./approved-homepage-content";
export function ApprovedHomepage() {
 useEffect(() => {
  const root=document.querySelector<HTMLElement>(".approved-homepage"); if(!root)return;
  root.classList.add("motion-enabled");
  const sectionTarget=(id:string)=>{const aliases:Record<string,string>={shelf:"features",focus:"supporting-tools",planner:"supporting-tools",achievements:"supporting-tools"};return root.querySelector<HTMLElement>(`#${CSS.escape(aliases[id]??id)}`);};
  const scrollToSection=(target:HTMLElement)=>{const header=root.querySelector<HTMLElement>(".topbar");const offset=header?.getBoundingClientRect().height??76;const top=target.getBoundingClientRect().top+window.scrollY-offset;window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});};
  const getMenuElements=()=>({button:root.querySelector<HTMLButtonElement>("#menuBtn"),panel:root.querySelector<HTMLElement>("#mobilePanel")});
  const closeNavigation=()=>{const {button,panel}=getMenuElements();panel?.classList.remove("open");button?.setAttribute("aria-expanded","false");button?.setAttribute("aria-label","Open menu");const featureToggle=root.querySelector<HTMLAnchorElement>(".feature-nav > a[aria-haspopup]");featureToggle?.setAttribute("aria-expanded","false");};
  const handleClick=(event:MouseEvent)=>{const target=event.target;if(!(target instanceof Element))return;if(target.closest("#menuBtn")){const {button,panel}=getMenuElements();if(button&&panel){const isOpen=panel.classList.toggle("open");button.setAttribute("aria-expanded",String(isOpen));button.setAttribute("aria-label",isOpen?"Close menu":"Open menu");}event.preventDefault();return;}const anchor=target.closest<HTMLAnchorElement>("a[href^=\"#\"]");if(anchor&&root.contains(anchor)){const href=anchor.getAttribute("href")??"";if(href.startsWith("#/")){closeNavigation();}else{const id=decodeURIComponent(href.slice(1));const destination=sectionTarget(id);if(destination){event.preventDefault();closeNavigation();const onSubpage=["#/about","#/faq","#/contact","#/privacy","#/terms"].includes(window.location.hash);if(onSubpage){window.location.hash=href;}else{if(window.location.hash!==href)window.history.pushState(null,"",href);scrollToSection(destination);}}}}const faq=target.closest<HTMLButtonElement>(".faq-question");if(faq&&root.contains(faq)){const item=faq.closest<HTMLElement>(".faq-item");item?.classList.toggle("open");const isOpen=!!item?.classList.contains("open");faq.setAttribute("aria-expanded",String(isOpen));const answer=item?.querySelector<HTMLElement>(".faq-answer");answer?.setAttribute("aria-hidden",String(!isOpen));const mark=faq.querySelector<HTMLElement>("span:last-child");if(mark)mark.textContent=isOpen?"−":"＋";}const link=target.closest<HTMLAnchorElement>("#mobilePanel a");if(link)closeNavigation();};
  const handleOutsideMenuClick=(event:PointerEvent)=>{const target=event.target;if(!(target instanceof Element))return;const {panel}=getMenuElements();if(!panel?.classList.contains("open"))return;if(!window.matchMedia("(max-width: 800px)").matches)return;if(target.closest("#mobilePanel")||target.closest("#menuBtn"))return;closeNavigation();};
  const handleSubmit=(event:SubmitEvent)=>{const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=="contactForm")return;event.preventDefault();const status=root.querySelector<HTMLElement>("#formStatus");if(status){status.textContent="Thank you — the form design is working. Message delivery will be enabled when the contact backend is connected.";status.classList.add("show");}};
  const route=()=>{const key=(window.location.hash.match(/^#\/(about|faq|contact|privacy|terms)$/)||[])[1];root.querySelectorAll<HTMLElement>(".page-view").forEach(v=>v.classList.remove("active"));root.classList.toggle("has-active-page",!!key);const home=root.querySelector<HTMLElement>("#top");if(key){if(home)home.style.display="none";root.querySelector<HTMLElement>(`#page-${key}`)?.classList.add("active");window.scrollTo({top:0,left:0,behavior:"auto"});const titles:Record<string,string>={about:"About Studenv",faq:"Frequently Asked Questions",contact:"Contact Studenv",privacy:"Privacy Policy",terms:"Terms of Service"};document.title=`${titles[key]} — Studenv`;}else{if(home)home.style.display="";document.title="Studenv — Your knowledge deserves a home";if(window.location.hash&&window.location.hash!=="#top"){window.setTimeout(()=>{const id=decodeURIComponent(window.location.hash.slice(1));const destination=sectionTarget(id);if(destination)scrollToSection(destination);},40);}else window.scrollTo(0,0);}};
  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
   observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
     if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer?.unobserve(entry.target);
     }
    });
   }, { threshold: 0.01, rootMargin: "160px 0px 200px 0px" });
  }
  document.addEventListener("click",handleClick,true);document.addEventListener("pointerdown",handleOutsideMenuClick);root.addEventListener("submit",handleSubmit);window.addEventListener("hashchange",route);const fadeElements=Array.from(root.querySelectorAll<HTMLElement>(".fade"));
  let revealFrame = 0;
  let revealSecondFrame = 0;
  const revealVisibleFades=()=>{
   if(revealFrame)window.cancelAnimationFrame(revealFrame);
   if(revealSecondFrame)window.cancelAnimationFrame(revealSecondFrame);
   // Wait for responsive styles and layout to settle before measuring positions.
   revealFrame=window.requestAnimationFrame(()=>{
    revealSecondFrame=window.requestAnimationFrame(()=>{
     fadeElements.forEach(el=>{
      const rect=el.getBoundingClientRect();
      if(rect.bottom>=-160&&rect.top<=window.innerHeight+200){
       el.classList.add("visible");
       observer?.unobserve(el);
      }
     });
    });
   });
  };
  fadeElements.forEach(el=>observer?observer.observe(el):el.classList.add("visible"));
  const rootResizeObserver=typeof ResizeObserver!=="undefined"
   ?new ResizeObserver(revealVisibleFades)
   :null;
  rootResizeObserver?.observe(root);
  window.addEventListener("resize",revealVisibleFades,{passive:true});
  window.visualViewport?.addEventListener("resize",revealVisibleFades,{passive:true});
  window.addEventListener("orientationchange",revealVisibleFades,{passive:true});
  window.addEventListener("scroll",revealVisibleFades,{passive:true});
  window.addEventListener("pageshow",revealVisibleFades);
  route();
  revealVisibleFades();
  return()=>{document.removeEventListener("click",handleClick,true);document.removeEventListener("pointerdown",handleOutsideMenuClick);root.removeEventListener("submit",handleSubmit);window.removeEventListener("hashchange",route);window.removeEventListener("resize",revealVisibleFades);window.visualViewport?.removeEventListener("resize",revealVisibleFades);window.removeEventListener("scroll",revealVisibleFades);window.removeEventListener("pageshow",revealVisibleFades);if(revealFrame)window.cancelAnimationFrame(revealFrame);if(revealSecondFrame)window.cancelAnimationFrame(revealSecondFrame);rootResizeObserver?.disconnect();observer?.disconnect();root.classList.remove("motion-enabled");};
 },[]);
 return <div className="approved-homepage" dangerouslySetInnerHTML={{__html:approvedHomepageMarkup}} />;
}