import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import SiteHeader from "../../components/home/SiteHeader";
import Hero from "../../components/home/Hero";
import Features, { TrustStrip } from "../../components/home/Features";
import UseCases from "../../components/home/UseCases";
import HowItWorks from "../../components/home/HowItWorks";
import PricingTeaser from "../../components/home/PricingTeaser";
import Faq from "../../components/home/Faq";
import SiteFooter, { CtaBand } from "../../components/home/SiteFooter";

export default function HomePage() {
  useEffect(() => {
    document.title = "SpearTick — WhatsApp campaigns, shared inbox & AI replies";
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {/* `marketing` keeps the home page on its own type (General Sans + Inter). */}
      <div className="marketing min-h-screen bg-canvas text-ink">
        <SiteHeader />
        <main>
          <Hero />
          <TrustStrip />
          <Features />
          <UseCases />
          <HowItWorks />
          <PricingTeaser />
          <Faq />
          <CtaBand />
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  );
}
