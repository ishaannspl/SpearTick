import { BookOpen, Dumbbell, Scissors, Shirt, ShoppingBasket, Utensils } from "lucide-react";
import Reveal from "./Reveal";

const CASES = [
  { icon: Shirt, title: "Clothing & fashion", body: "Announce new arrivals and sale days to everyone who ever bought from you.", tint: "bg-[#ddf5e8]" },
  { icon: Scissors, title: "Salons & clinics", body: "Remind customers about appointments and bring them back for the next visit.", tint: "bg-[#e3f0fb]" },
  { icon: Utensils, title: "Restaurants & sweets", body: "Share festival menus and take orders and questions in one shared inbox.", tint: "bg-[#fff1d6]" },
  { icon: BookOpen, title: "Coaching & classes", body: "Send batch timings, fee reminders and results to students and parents.", tint: "bg-[#e3f0fb]" },
  { icon: ShoppingBasket, title: "Online & local stores", body: "Reply fast to \"is this in stock?\" and win back customers with offers.", tint: "bg-[#fff1d6]" },
  { icon: Dumbbell, title: "Gyms & services", body: "Keep members active with renewals, offers and quick answers.", tint: "bg-[#ddf5e8]" },
];

export default function UseCases() {
  return (
    <section className="py-14 lg:py-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[14px] font-semibold uppercase tracking-[0.14em] text-brand-600">Who it's for</p>
          <h2 className="mt-3 text-[32px] font-semibold tracking-[-0.02em] text-brand-950 sm:text-[44px]">
            Made for businesses that sell on WhatsApp
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASES.map(({ icon: Icon, title, body, tint }, index) => (
            <Reveal key={title} delay={(index % 3) * 0.06} className={`rounded-2xl p-6 ${tint}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-900 shadow-sm">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 text-[19px] font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
