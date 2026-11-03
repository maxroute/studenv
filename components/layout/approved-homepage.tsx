"use client";

import { useEffect } from "react";
import approvedHomepageMarkup from "./approved-homepage-content";

export function ApprovedHomepage() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".approved-homepage");
    if (!root) return;

    root.classList.add("motion-enabled");

    const pagePaths: Record<string, string> = {
      "/about": "about",
      "/faq": "faq",
      "/contact": "contact",
      "/privacy": "privacy",
      "/terms": "terms",
    };

    const sectionTarget = (id: string) => {
      const aliases: Record<string, string> = {
        shelf: "features",
        focus: "supporting-tools",
        planner: "supporting-tools",
        achievements: "supporting-tools",
      };
      return root.querySelector<HTMLElement>("#" + CSS.escape(aliases[id] ?? id));
    };

    const scrollToSection = (target: HTMLElement) => {
      const header = root.querySelector<HTMLElement>(".topbar");
      const offset = header?.getBoundingClientRect().height ?? 76;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    };

    const getMenuElements = () => ({
      button: root.querySelector<HTMLButtonElement>("#menuBtn"),
      panel: root.querySelector<HTMLElement>("#mobilePanel"),
    });

    const closeNavigation = () => {
      const { button, panel } = getMenuElements();
      panel?.classList.remove("open");
      button?.setAttribute("aria-expanded", "false");
      button?.setAttribute("aria-label", "Open menu");
      root.querySelector<HTMLAnchorElement>(".feature-nav > a[aria-haspopup]")?.setAttribute("aria-expanded", "false");
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("#menuBtn")) {
        const { button, panel } = getMenuElements();
        if (button && panel) {
          const isOpen = panel.classList.toggle("open");
          button.setAttribute("aria-expanded", String(isOpen));
          button.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
        }
        event.preventDefault();
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (anchor && root.contains(anchor)) {
        const href = anchor.getAttribute("href") ?? "";
        const id = decodeURIComponent(href.slice(1));
        const destination = sectionTarget(id);

        if (destination) {
          event.preventDefault();
          closeNavigation();

          if (window.location.pathname !== "/") {
            window.location.assign("/#" + encodeURIComponent(id));
          } else {
            if (window.location.hash !== href) {
              window.history.pushState(null, "", href);
            }
            scrollToSection(destination);
          }
        }
      }

      const homeLink = target.closest<HTMLAnchorElement>('a[href="/"]');
      if (homeLink && root.contains(homeLink) && window.location.pathname === "/") {
        event.preventDefault();
        window.history.replaceState(null, "", "/");
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        closeNavigation();
      }

      const faq = target.closest<HTMLButtonElement>(".faq-question");
      if (faq && root.contains(faq)) {
        const item = faq.closest<HTMLElement>(".faq-item");
        item?.classList.toggle("open");
        const isOpen = !!item?.classList.contains("open");
        faq.setAttribute("aria-expanded", String(isOpen));
        item?.querySelector<HTMLElement>(".faq-answer")?.setAttribute("aria-hidden", String(!isOpen));
        const mark = faq.querySelector<HTMLElement>("span:last-child");
        if (mark) mark.textContent = isOpen ? "−" : "＋";
      }

      if (target.closest("#mobilePanel a")) closeNavigation();
    };

    const handleOutsideMenuClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const { panel } = getMenuElements();
      if (!panel?.classList.contains("open")) return;
      if (!window.matchMedia("(max-width: 800px)").matches) return;
      if (target.closest("#mobilePanel") || target.closest("#menuBtn")) return;
      closeNavigation();
    };

    const handleSubmit = async (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "contactForm") return;

      event.preventDefault();
      const status = root.querySelector<HTMLElement>("#formStatus");
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!form.reportValidity()) return;

      if (submit) {
        submit.disabled = true;
        submit.textContent = "Sending…";
      }
      if (status) {
        status.textContent = "Sending your message…";
        status.classList.add("show");
      }

      try {
        const formData = new FormData(form);
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            subject: String(formData.get("subject") ?? ""),
            message: String(formData.get("message") ?? ""),
            website: String(formData.get("website") ?? ""),
          }),
        });
        const result = await response.json() as { ok?: boolean; message?: string; error?: string };
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "We couldn't send your message right now. Please try again later.");
        }
        form.reset();
        if (status) status.textContent = result.message || "Your message has been sent. Thank you for contacting Studenv.";
      } catch (error) {
        if (status) {
          status.textContent = error instanceof Error
            ? error.message
            : "We couldn't send your message right now. Please try again later.";
        }
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Send message ↗";
        }
      }
    };

    const route = () => {
      const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
      let key = pagePaths[pathname] ?? null;

      // Preserve old shared links such as /#/about by converting them to clean paths.
      if (pathname === "/") {
        const legacyPage = (window.location.hash.match(/^#\/(about|faq|contact|privacy|terms)$/) || [])[1];
        if (legacyPage) {
          key = legacyPage;
          window.history.replaceState(null, "", "/" + legacyPage);
        } else if (window.location.hash === "#top") {
          window.history.replaceState(null, "", "/");
        }
      }

      root.querySelectorAll<HTMLElement>(".page-view").forEach((view) => view.classList.remove("active"));
      root.classList.toggle("has-active-page", !!key);

      if (key) {
        root.querySelector<HTMLElement>("#page-" + key)?.classList.add("active");
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        const titles: Record<string, string> = {
          about: "About Studenv",
          faq: "Frequently Asked Questions",
          contact: "Contact Studenv",
          privacy: "Privacy Policy",
          terms: "Terms of Service",
        };
        document.title = titles[key] + " — Studenv";
      } else {
        document.title = "Studenv — Your knowledge deserves a home";
        if (window.location.hash) {
          window.setTimeout(() => {
            const id = decodeURIComponent(window.location.hash.slice(1));
            const destination = sectionTarget(id);
            if (destination) scrollToSection(destination);
          }, 40);
        } else {
          window.scrollTo(0, 0);
        }
      }
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.01, rootMargin: "160px 0px 200px 0px" });
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("pointerdown", handleOutsideMenuClick);
    root.addEventListener("submit", handleSubmit);
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);

    const fadeElements = Array.from(root.querySelectorAll<HTMLElement>(".fade"));
    let revealFrame = 0;
    let revealSecondFrame = 0;

    const revealVisibleFades = () => {
      if (revealFrame) window.cancelAnimationFrame(revealFrame);
      if (revealSecondFrame) window.cancelAnimationFrame(revealSecondFrame);

      revealFrame = window.requestAnimationFrame(() => {
        revealSecondFrame = window.requestAnimationFrame(() => {
          fadeElements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.bottom >= -160 && rect.top <= window.innerHeight + 200) {
              element.classList.add("visible");
              observer?.unobserve(element);
            }
          });
        });
      });
    };

    fadeElements.forEach((element) => observer ? observer.observe(element) : element.classList.add("visible"));

    const rootResizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(revealVisibleFades)
      : null;

    rootResizeObserver?.observe(root);
    window.addEventListener("resize", revealVisibleFades, { passive: true });
    window.visualViewport?.addEventListener("resize", revealVisibleFades, { passive: true });
    window.addEventListener("orientationchange", revealVisibleFades, { passive: true });
    window.addEventListener("scroll", revealVisibleFades, { passive: true });
    window.addEventListener("pageshow", revealVisibleFades);

    route();
    revealVisibleFades();

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("pointerdown", handleOutsideMenuClick);
      root.removeEventListener("submit", handleSubmit);
      window.removeEventListener("hashchange", route);
      window.removeEventListener("popstate", route);
      window.removeEventListener("resize", revealVisibleFades);
      window.visualViewport?.removeEventListener("resize", revealVisibleFades);
      window.removeEventListener("orientationchange", revealVisibleFades);
      window.removeEventListener("scroll", revealVisibleFades);
      window.removeEventListener("pageshow", revealVisibleFades);
      if (revealFrame) window.cancelAnimationFrame(revealFrame);
      if (revealSecondFrame) window.cancelAnimationFrame(revealSecondFrame);
      rootResizeObserver?.disconnect();
      observer?.disconnect();
      root.classList.remove("motion-enabled");
    };
  }, []);

  return <div className="approved-homepage" dangerouslySetInnerHTML={{ __html: approvedHomepageMarkup }} />;
}
