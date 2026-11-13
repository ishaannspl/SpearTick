import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ImagePlus, Save, X } from "lucide-react";
import api from "../../services/api";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button, Card, Input, Textarea } from "../../components/ui";
import WhatsAppPreview from "../../components/templates/WhatsAppPreview";
import { QUICK_VARS, isMetaTemplate } from "../../constants/templates";

// A plain saved message: no WhatsApp approval, so it can only be sent to
// people who messaged the business in the last 24 hours. Templates that go
// to WhatsApp for approval use the wizard in CreateApprovedTemplatePage.jsx.
const PLAIN_CATEGORY = "Plain message";

export default function CreateTemplatePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const descRef = useRef(null);
  const { id } = useParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState("");
  const [removeMedia, setRemoveMedia] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/api/templates/${id}`)
      .then((res) => {
        const t = res.data.template;
        // Templates on the approval track are edited in the wizard.
        if (isMetaTemplate(t) || t.metaCategory) {
          navigate(`/templates/approved/edit/${id}`, { replace: true });
          return;
        }
        setName(t.name || "");
        setDescription(t.description || "");
        setExistingMediaUrl(t.headerMediaUrl || t.mediaUrl || "");
      })
      .catch(() => toast.error("Couldn't load this message. Refresh the page to try again."));
  }, [id, navigate]);

  function insertVariable(v) {
    const ta = descRef.current;
    if (!ta) {
      setDescription((prev) => prev + v);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setDescription(description.slice(0, start) + v + description.slice(end));
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  }

  function pickImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image (JPG or PNG).");
      return;
    }
    setMedia(file);
    setRemoveMedia(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give the message a name you'll recognise.");
    if (!description.trim()) return setError("Write the message.");

    try {
      setLoading(true);
      const data = new FormData();
      data.append("name", name.trim());
      data.append("category", PLAIN_CATEGORY);
      data.append("description", description);
      data.append("status", "active");
      if (media) {
        data.append("media", media);
        data.append("headerMedia", media);
      }
      if (removeMedia) {
        data.append("removeMedia", "true");
        data.append("removeHeaderMedia", "true");
      }
      if (id) await api.put(`/api/templates/${id}`, data);
      else await api.post("/api/templates", data);
      toast.success("Message saved. Pick it under “Plain message” when you create a campaign.");
      navigate("/templates?tab=drafts");
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't save the message. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const showImage = Boolean(media) || (Boolean(existingMediaUrl) && !removeMedia);

  return (
    <DashboardLayout title={id ? "Edit plain message" : "Save a plain message"}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className="mb-6">
          <Link
            to="/templates"
            className="mb-3 inline-flex items-center gap-1 text-[14px] font-medium text-ink-muted hover:text-brand-700"
          >
            <ChevronLeft size={16} />
            Templates
          </Link>
          <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
            {id ? "Edit plain message" : "Save a plain message"}
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">A reusable message that doesn&apos;t need WhatsApp&apos;s approval.</p>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p className="text-[14px] text-ink">
            <strong className="font-semibold">Plain messages only reach people who messaged you in the last 24 hours.</strong>{" "}
            To message your whole list, create a{" "}
            <Link to="/templates/approved/create" className="font-semibold text-brand-700 underline">
              template for WhatsApp approval
            </Link>{" "}
            instead.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="space-y-5">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Thank you for visiting"
              help="Only you see this name."
            />

            <div>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[13px] text-ink-muted">Insert a blank:</span>
                {QUICK_VARS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="h-8 rounded-lg border border-line bg-canvas px-2.5 font-mono text-[13px] text-ink transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Textarea
                ref={descRef}
                label="Message"
                rows={7}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write your message…"
                inputClassName="resize-none text-[15px]"
                help="Blanks like {{name}} are filled from the matching column of your contact list when you send."
              />
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink">Image (optional)</p>
              {showImage ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3">
                  <span className="truncate text-[14px] text-ink">{media ? media.name : "Current image"}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={X}
                    onClick={() => {
                      setMedia(null);
                      setRemoveMedia(Boolean(existingMediaUrl));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" leftIcon={ImagePlus} onClick={() => fileInputRef.current?.click()}>
                  Add an image
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </div>

            {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}

            <div className="flex flex-wrap gap-2.5 border-t border-line pt-5">
              <Button type="submit" leftIcon={Save} loading={loading} disabled={loading}>
                {loading ? "Saving…" : "Save message"}
              </Button>
              <Button variant="ghost" onClick={() => navigate("/templates")}>
                Cancel
              </Button>
            </div>
          </Card>

          <div className="lg:sticky lg:top-6">
            <Card>
              <h2 className="text-[17px] font-semibold text-ink">Preview</h2>
              <p className="mb-5 mt-1 text-[14px] text-ink-muted">How customers will see your message.</p>
              <WhatsAppPreview
                name={name}
                headerType={showImage ? "IMAGE" : "NONE"}
                headerMediaFile={media}
                headerMediaUrl={removeMedia ? "" : existingMediaUrl}
                body={description}
              />
            </Card>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}
