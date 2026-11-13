import { Button, Modal } from "../ui";

/**
 * A plain "are you sure?" popup, used instead of the browser's own confirm()
 * box so the wording can explain exactly what will happen.
 *
 * @example
 *   <ConfirmDialog open={open} title="Delete this template?" confirmLabel="Delete"
 *     danger onConfirm={remove} onCancel={() => setOpen(false)}>
 *     It will be removed from SpearTick.
 *   </ConfirmDialog>
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Yes, continue",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-[14px] leading-relaxed text-ink-muted">{children}</div>
    </Modal>
  );
}
