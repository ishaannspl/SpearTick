import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "../../utils/cn";
import Logo from "../ui/Logo";
import useActiveSession from "../../hooks/useActiveSession";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Signed-in visitors get a link into their app instead of an auto-redirect.
  const session = useActiveSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Announcement bar */}
      <div className="bg-accent text-center text-[14px] font-medium text-brand-900">
        <Link to="/signup" className="flex items-center justify-center gap-2 px-4 py-2 hover:underline">
          <span className="rounded-full bg-brand-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            New
          </span>
          Free plan available — connect WhatsApp and send your first campaign today
          <ArrowRight size={15} className="hidden sm:block" />
        </Link>
      </div>

      <header
        className={cn(
          "sticky top-0 z-50 bg-brand-900 text-white transition-shadow duration-200",
          scrolled || menuOpen ? "shadow-[0_8px_24px_rgba(5,30,22,0.25)]" : "",
        )}
      >
        <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="SpearTick home">
            <Logo inverted />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-[15px] font-medium text-white/75 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {session ? (
              <Link
                to={session.path}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-display text-[15px] font-semibold text-brand-900 transition-colors hover:bg-[#b9e650]"
              >
                {session.label} <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-xl px-4 py-2.5 font-display text-[15px] font-medium text-white transition-colors hover:bg-white/10"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-xl bg-accent px-5 py-2.5 font-display text-[15px] font-semibold text-brand-900 transition-colors hover:bg-[#b9e650]"
                >
                  Start free
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 text-white md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-brand-900 px-4 pb-5 pt-2 md:hidden">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-3 text-[15px] font-medium text-white"
              >
                {link.label}
              </a>
            ))}
            {session ? (
              <Link
                to={session.path}
                className="mt-3 block rounded-xl bg-accent py-3 text-center font-display font-semibold text-brand-900"
              >
                {session.label}
              </Link>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  className="rounded-xl border border-white/25 py-3 text-center font-display font-medium text-white"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-xl bg-accent py-3 text-center font-display font-semibold text-brand-900"
                >
                  Start free
                </Link>
              </div>
            )}
          </div>
        )}
      </header>
    </>
  );
}
