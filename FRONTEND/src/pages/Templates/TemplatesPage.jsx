import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import api from "../../services/api";
import DashboardLayout from "../../components/layout/DashboardLayout";
import TemplatePreviewModal from "../../components/templates/TemplatePreviewModal";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { useTemplates } from "../../hooks/useTemplates";
import { formatRelativeDate } from "../../utils/date";
import {
  META_CATEGORY_LABELS,
  TEMPLATE_STAGES,
  explainTemplateProblem,
  languageLabel,
  templateStage,
} from "../../constants/templates";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Button, Card, Skeleton } from "../../components/ui";
import { cn } from "../../utils/cn";

const ITEMS_PER_PAGE = 15;

const TABS = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready to send" },
  { value: "waiting", label: "Waiting for WhatsApp" },
  { value: "needs_changes", label: "Needs changes" },
  { value: "drafts", label: "Drafts & plain" },
];

const inTab = (tab, stage) =>
  tab === "all" || tab === stage || (tab === "drafts" && (stage === "draft" || stage === "plain"));

// Plain messages open the simple editor; everything else opens the
// approval wizard.
const editPath = (template) =>
  templateStage(template) === "plain" ? `/templates/edit/${template._id}` : `/templates/approved/edit/${template._id}`;

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { templates, loading, refetch, deleteTemplate } = useTemplates();
  const [search, setSearch] = useState("");
  const tab = TABS.some((t) => t.value === searchParams.get("tab")) ? searchParams.get("tab") : "all";
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(() => {
    const c = { all: templates.length, ready: 0, waiting: 0, needs_changes: 0, drafts: 0 };
    templates.forEach((t) => {
      const stage = templateStage(t);
      if (stage === "draft" || stage === "plain") c.drafts += 1;
      else c[stage] += 1;
    });
    return c;
  }, [templates]);

  const filteredTemplates = useMemo(
    () =>
      templates.filter((t) => {
        const q = search.trim().toLowerCase();
        if (q && !`${t.name} ${t.description || ""}`.toLowerCase().includes(q)) return false;
        return inTab(tab, templateStage(t));
      }),
    [templates, search, tab],
  );

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedTemplates = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredTemplates.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTemplates, safePage]);

  useEffect(() => { setPage(1); }, [search, tab]);

  function setTab(value) {
    setSearchParams(value === "all" ? {} : { tab: value }, { replace: true });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      setDeleting(true);
      await deleteTemplate(toDelete._id);
      if (previewTemplate?._id === toDelete._id) setPreviewTemplate(null);
      toast.success("Template deleted");
      setToDelete(null);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't delete the template. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  // One button for both: refresh the status of templates already here, and
  // bring in templates created directly in Meta Business Suite.
  async function handleSyncWithWhatsApp() {
    setSyncing(true);
    try {
      const [syncRes, importRes] = await Promise.allSettled([
        api.post("/api/templates/sync-meta"),
        api.post("/api/templates/import-meta"),
      ]);
      await refetch();
      if (syncRes.status === "rejected" && importRes.status === "rejected") {
        throw syncRes.reason;
      }
      const updated = syncRes.status === "fulfilled" ? syncRes.value.data.updated?.length || 0 : 0;
      const imported = importRes.status === "fulfilled" ? importRes.value.data.imported?.length || 0 : 0;
      if (!updated && !imported) toast.success("Everything is already up to date.");
      else {
        toast.success(
          [updated && `${updated} status update${updated === 1 ? "" : "s"}`, imported && `${imported} new from WhatsApp`]
            .filter(Boolean)
            .join(", "),
        );
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Couldn't reach WhatsApp right now. Please try again in a minute.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <DashboardLayout title="Templates">
      <div className="w-full">
        {/* Page header */}
        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">Templates</h1>
            <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">
              Messages you send in campaigns. WhatsApp checks each template first, usually within a few hours.
              Once it shows <strong className="font-semibold text-ink">Ready to send</strong>, you can use it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" onClick={handleSyncWithWhatsApp} disabled={syncing} title="Check WhatsApp for status updates and templates made in Meta Business Suite">
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Checking…" : "Get latest from WhatsApp"}
            </Button>
            <Button leftIcon={Plus} onClick={() => navigate("/templates/approved/create")}>
              New template
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          {/* Filter bar */}
          <Card padded={false} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                type="text"
                placeholder="Search by name or wording…"
                aria-label="Search templates"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-subtle outline-none transition hover:border-ink-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/12"
              />
            </div>
            <div
              role="tablist"
              aria-label="Template status"
              className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1 scrollbar-hide"
            >
              {TABS.map((item) => {
                const active = tab === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.value)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[14px] font-medium transition-colors",
                      active ? "bg-brand-900 text-white" : "text-ink-muted hover:bg-canvas hover:text-ink",
                    )}
                  >
                    {item.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[12px] tabular-nums",
                        active ? "bg-white/15" : item.value === "needs_changes" && counts.needs_changes ? "bg-danger-soft text-danger" : "bg-canvas",
                      )}
                    >
                      {counts[item.value]}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Content */}
          {loading ? (
            <Card padded={false} className="space-y-3 p-5" aria-label="Loading templates">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </Card>
          ) : templates.length === 0 ? (
            <EmptyBox
              title="No templates yet"
              description="Start from a ready-made template (festival offer, order update, payment reminder…) or write your own. WhatsApp checks it before you can send it."
              action={
                <Button leftIcon={Plus} onClick={() => navigate("/templates/approved/create")}>
                  New template
                </Button>
              }
            />
          ) : filteredTemplates.length === 0 ? (
            <EmptyBox
              icon={Search}
              title="Nothing here"
              description={search ? "No templates match your search." : "No templates have this status right now."}
              action={
                <Button variant="secondary" leftIcon={X} onClick={() => { setSearch(""); setTab("all"); }}>
                  Show all templates
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-[#f6f7f6]">
                      {["Template", "Type", "Status", "Language", "Updated", ""].map((label, i) => (
                        <th
                          key={label || i}
                          scope="col"
                          className={`px-4 py-3 text-[13px] font-medium text-ink-muted ${label ? "" : "w-[190px]"}`}
                        >
                          {label || <span className="sr-only">Actions</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-line">
                    {paginatedTemplates.map((template) => {
                      const stage = templateStage(template);
                      const stageInfo = TEMPLATE_STAGES[stage];
                      return (
                        <tr
                          key={template._id}
                          onClick={() => setPreviewTemplate(template)}
                          className="cursor-pointer text-[14px] transition-colors hover:bg-canvas"
                        >
                          <td className="max-w-[320px] px-4 py-3.5">
                            <p className="font-medium leading-snug text-ink">{template.name}</p>
                            {template.description && (
                              <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-muted">{template.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-ink-muted">
                            {stage === "plain" ? "Plain" : META_CATEGORY_LABELS[template.metaCategory] || "—"}
                          </td>
                          <td className="max-w-[300px] px-4 py-3.5">
                            <Badge tone={stageInfo.tone} dot>
                              {stageInfo.label}
                            </Badge>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-muted">
                              {stage === "needs_changes" ? explainTemplateProblem(template) : stageInfo.hint}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-ink-muted">
                            {stage === "plain" ? "—" : languageLabel(template.language)}
                          </td>
                          <td className="px-4 py-3.5 tabular-nums text-ink-muted">
                            {formatRelativeDate(template.updatedAt || template.createdAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              {stage === "ready" && (
                                <Button
                                  size="sm"
                                  leftIcon={Send}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate("/campaigns/upload", { state: { prefilledTemplateId: template._id } });
                                  }}
                                  title="Create a campaign with this template"
                                >
                                  Use
                                </Button>
                              )}
                              {stage === "needs_changes" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(editPath(template));
                                  }}
                                >
                                  Fix
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewTemplate(template);
                                }}
                                aria-label="Preview template"
                                title="Preview"
                              >
                                <Eye size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(editPath(template));
                                }}
                                aria-label="Edit template"
                                title="Edit"
                              >
                                <Pencil size={16} />
                              </Button>
                              <Button
                                variant="danger-ghost"
                                size="icon-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setToDelete(template);
                                }}
                                aria-label="Delete template"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-line px-4 py-3">
                  <p className="text-[14px] tabular-nums text-ink-muted">
                    {(safePage - 1) * ITEMS_PER_PAGE + 1}–
                    {Math.min(safePage * ITEMS_PER_PAGE, filteredTemplates.length)} of{" "}
                    {filteredTemplates.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="min-w-[60px] text-center text-[14px] tabular-nums text-ink-muted">
                      {safePage} / {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-[14px] text-ink-muted">
            Only need a quick message for customers who messaged you today?{" "}
            <button type="button" onClick={() => navigate("/templates/create")} className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Save a plain message
            </button>{" "}
            (no approval needed, but it only reaches people who messaged you in the last 24 hours).
          </p>
        </div>
      </div>

      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onEdit={() => {
          const target = previewTemplate;
          setPreviewTemplate(null);
          navigate(editPath(target));
        }}
        badges={
          previewTemplate
            ? [
                { label: TEMPLATE_STAGES[templateStage(previewTemplate)].label, tone: TEMPLATE_STAGES[templateStage(previewTemplate)].tone },
                ...(previewTemplate.metaCategory
                  ? [{ label: META_CATEGORY_LABELS[previewTemplate.metaCategory], tone: "neutral" }]
                  : []),
              ]
            : []
        }
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete “${toDelete?.name || ""}”?`}
        confirmLabel="Delete template"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        <p>It will be removed from SpearTick. Campaigns already sent are not affected.</p>
        {toDelete && templateStage(toDelete) !== "plain" && (
          <p>
            It stays in your WhatsApp account (Meta Business Suite). You can bring it back later with
            &ldquo;Get latest from WhatsApp&rdquo;.
          </p>
        )}
      </ConfirmDialog>
    </DashboardLayout>
  );
}

/* ── Small building blocks ─────────────────────────────────────────── */

function EmptyBox({ icon: Icon = FileText, title, description, action }) {
  return (
    <Card>
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-canvas px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-muted shadow-[var(--shadow-card)]">
          <Icon size={20} />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-md text-[14px] text-ink-muted">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </Card>
  );
}
