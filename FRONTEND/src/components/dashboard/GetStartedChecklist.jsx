import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Clock3, X } from "lucide-react";
import api from "../../services/api";
import { Button, Card } from "../ui";
import { cn } from "../../utils/cn";
import { hasSentTest, isChecklistHidden, setChecklistHidden } from "../../utils/onboardingProgress";

/**
 * The five things a new account must do before WhatsApp campaigns work,
 * in order, with one button for the next step. Disappears once all are done.
 * `campaignCount` and `contactCount` come from data the dashboard already loads.
 */
export default function GetStartedChecklist({ companyId, campaignCount, contactCount }) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [hidden, setHidden] = useState(() => isChecklistHidden(companyId));

  useEffect(() => {
    api
      .get("api/templates")
      .then((r) => setTemplates(r.data.templates || []))
      .catch(() => setTemplates([]));
  }, []);

  const approved = (templates || []).filter((t) => t.metaStatus === "APPROVED").length;
  const waiting = (templates || []).filter((t) => t.metaStatus === "PENDING").length;
  const hasCampaign = campaignCount > 0;

  const steps = [
    {
      id: "connect",
      title: "Connect your WhatsApp number",
      description: "Done. Your business number is linked to SpearTick.",
      done: true,
    },
    {
      id: "contacts",
      title: "Add your customers",
      description: "Upload a list from Excel or add people one by one. You need their phone numbers.",
      done: contactCount > 0,
      action: { label: "Add contacts", to: "/contacts" },
    },
    {
      id: "template",
      title: "Get a message template approved",
      description: waiting && !approved
        ? `${waiting} template${waiting === 1 ? " is" : "s are"} waiting for WhatsApp's approval. This usually takes a few minutes to a few hours.`
        : "WhatsApp checks every broadcast message first. Pick a ready-made one or write your own.",
      done: approved > 0,
      waiting: waiting > 0 && !approved,
      action: { label: "Create a template", to: "/templates/approved/create" },
    },
    {
      id: "test",
      title: "Send yourself a test message",
      description: "See exactly what your customers will get, on your own phone.",
      done: hasSentTest(companyId) || hasCampaign,
      action: { label: "Send a test", to: "/campaigns/upload" },
    },
    {
      id: "campaign",
      title: "Send your first campaign",
      description: "Choose who gets it, check the cost, and send now or later.",
      done: hasCampaign,
      action: { label: "Create campaign", to: "/campaigns/upload" },
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find((s) => !s.done && !s.waiting) || steps.find((s) => !s.done);

  if (templates === null || allDone || hidden) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Get started with WhatsApp</h2>
          <p className="mt-1 text-[14px] text-ink-muted">
            {doneCount} of {steps.length} done. Finish these steps to send your first campaign.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setChecklistHidden(companyId, true);
            setHidden(true);
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-ink-muted hover:bg-canvas hover:text-ink"
        >
          <X size={14} />
          Hide for now
        </button>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eceeed]" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="mt-5 space-y-1">
        {steps.map((step, index) => {
          const isNext = step === nextStep;
          return (
            <li
              key={step.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl px-3 py-3 sm:flex-row sm:items-center",
                isNext && "bg-brand-50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums",
                  step.done
                    ? "bg-brand-600 text-white"
                    : step.waiting
                      ? "bg-warning-soft text-warning"
                      : isNext
                        ? "bg-brand-900 text-white"
                        : "border border-line-strong bg-surface text-ink-muted",
                )}
              >
                {step.done ? <Check size={16} /> : step.waiting ? <Clock3 size={16} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[15px] font-medium", step.done ? "text-ink-muted line-through" : "text-ink")}>
                  {step.title}
                </p>
                {!step.done && <p className="mt-0.5 text-[14px] text-ink-muted">{step.description}</p>}
              </div>
              {!step.done && step.action && (
                <Button
                  variant={isNext ? "primary" : "secondary"}
                  size="sm"
                  rightIcon={isNext ? ArrowRight : undefined}
                  onClick={() => navigate(step.action.to)}
                  className="self-start sm:self-center"
                >
                  {step.action.label}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
