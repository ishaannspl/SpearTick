import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { Button, Modal } from "../ui";
import useAuthStore from "../../store/authStore";
import useUpgradePromptStore from "../../store/upgradePromptStore";

const TITLES = {
  FEATURE_LOCKED: "This needs a higher plan",
  USER_LIMIT_REACHED: "Your team is full on this plan",
  CONTACT_LIMIT_REACHED: "You've reached your contact limit",
  TEMPLATE_LIMIT_REACHED: "You've reached your template limit",
  WHATSAPP_NUMBER_LIMIT_REACHED: "Your plan allows fewer WhatsApp numbers",
  CAMPAIGN_LIMIT_REACHED: "You've reached this month's campaign limit",
  TRIAL_EXPIRED: "Your free trial has ended",
  SUBSCRIPTION_INACTIVE: "Your plan isn't active",
  NO_SUBSCRIPTION: "Choose a plan to continue",
  NO_PLAN: "Choose a plan to continue",
};

// One popup for every "your plan doesn't allow this" answer from the server.
// Mounted once in App.jsx; opened by the API layer (services/api.js).
export default function UpgradePrompt() {
  const navigate = useNavigate();
  const prompt = useUpgradePromptStore((s) => s.prompt);
  const close = useUpgradePromptStore((s) => s.close);
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "ADMIN";

  if (!prompt) return null;

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={TITLES[prompt.code] || "Upgrade to continue"}
      footer={
        isAdmin ? (
          <>
            <Button variant="secondary" onClick={close}>
              Not now
            </Button>
            <Button
              rightIcon={ArrowRight}
              onClick={() => {
                close();
                navigate("/billing");
              }}
            >
              See plans
            </Button>
          </>
        ) : (
          <Button onClick={close}>OK</Button>
        )
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Lock size={18} />
        </span>
        <div className="space-y-2 text-[14px]">
          <p className="text-ink">{prompt.message}</p>
          <p className="text-ink-muted">
            {isAdmin
              ? "Upgrading takes effect right away. Nothing you've set up is lost."
              : "Only your account admin can change the plan. Ask them to upgrade."}
          </p>
        </div>
      </div>
    </Modal>
  );
}
