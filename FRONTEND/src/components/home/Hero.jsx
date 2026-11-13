import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AiReplyChip, InboxMock, PhoneMock, TemplateMessage } from "./ProductMockups";

const REASSURANCES = ["Free plan available", "Pricing in ₹", "Guided WhatsApp setup"];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-900 via-[#0d4a39] to-[#128c5e] text-white">
      {/* Soft glow behind the product */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-10%] top-[-10%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(200,241,105,0.22),transparent)]" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.08),transparent)]" />
      </div>

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:pb-24 lg:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[14px] font-medium text-white/90">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Built on the official WhatsApp Cloud API
          </span>

          <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[52px] lg:text-[58px]">
            Turn WhatsApp chats into <span className="text-accent">repeat sales</span>
          </h1>

          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/80">
            Send offers to all your customers, answer every message from one shared inbox, and let AI reply when
            you're busy — built for shop owners, not tech teams.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-7 font-display text-[16px] font-semibold text-brand-900 transition-colors hover:bg-[#b9e650] sm:w-auto"
            >
              Start free <ArrowRight size={18} />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex h-[52px] w-full items-center justify-center rounded-xl border border-white/30 px-7 font-display text-[16px] font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              See how it works
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium text-white/80">
            {REASSURANCES.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckCircle2 size={17} className="text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative pb-6"
        >
          <InboxMock className="mr-0 shadow-[0_30px_80px_rgba(0,0,0,0.35)] lg:mr-24" />

          <PhoneMock className="absolute -right-2 top-10 hidden lg:block">
            <TemplateMessage />
          </PhoneMock>

          <AiReplyChip className="absolute -bottom-2 left-4 hidden sm:flex lg:-left-8" />
        </motion.div>
      </div>
    </section>
  );
}
