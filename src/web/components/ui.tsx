import * as React from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, formatStatus, renderSimpleMarkdown } from "../lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[18px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-ink text-soft hover:bg-ink-soft",
        secondary: "bg-canvas text-ink hover:bg-line",
        outline: "border border-line bg-paper text-ink hover:bg-soft",
        ghost: "bg-transparent text-ink hover:bg-canvas",
        danger: "bg-danger text-white hover:bg-danger/90",
        dark: "bg-ink text-soft hover:bg-ink-soft",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[18px] px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[24px] border border-line bg-paper shadow-card", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "muted",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "ok" | "warn" | "danger" | "info" | "muted" | "ai" | "primary";
}) {
  // Monochrome Paper: only danger keeps red; other tones are ink/muted hierarchy.
  const tones: Record<string, string> = {
    ok: "bg-ink-soft text-soft border-transparent",
    warn: "bg-canvas text-ink border-line",
    danger: "bg-danger/10 text-danger border-danger/20",
    info: "bg-canvas text-mid border-line",
    muted: "bg-canvas text-ink border-line",
    ai: "bg-canvas text-ink border-line",
    primary: "bg-ink text-soft border-transparent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[18px] border px-2 py-0.5 text-xs font-medium tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{formatStatus(status)}</Badge>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-mid">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const fieldControl =
  "h-9 w-full rounded-[18px] border border-transparent bg-canvas px-2.5 text-sm text-ink outline-none placeholder:text-mid focus:border-line focus:ring-0";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldControl, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-[18px] border border-transparent bg-canvas px-2.5 py-2 text-sm text-ink outline-none placeholder:text-mid focus:border-line focus:ring-0",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldControl, props.className)} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-mid", className)} {...props} />;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  // Associate the label with its control. Without this the field is unreachable by
  // accessible name, which blocks assistive tech and browser agents alike
  // (a judged run could not fill “Your name” on the public CFP).
  const child = React.isValidElement(children) ? children : null;
  const existing = child?.props as { id?: string; "aria-label"?: string } | undefined;
  const generated = React.useId();
  const controlId = existing?.id || `field-${generated}`;
  const labelled =
    child && !existing?.["aria-label"]
      ? React.cloneElement(child as React.ReactElement<any>, { id: controlId })
      : children;
  return (
    <div className="mb-3">
      <Label htmlFor={child && !existing?.["aria-label"] ? controlId : undefined}>{label}</Label>
      {labelled}
      {hint ? <p className="mt-1 text-xs text-mid">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-line bg-paper p-8 text-center">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-mid">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({
  children,
  tone = "info",
  onClose,
}: {
  children: React.ReactNode;
  tone?: "info" | "ok" | "warn" | "danger";
  onClose?: () => void;
}) {
  const map = {
    info: "bg-canvas text-ink border-line",
    ok: "bg-soft text-ink border-line",
    warn: "bg-canvas text-ink-soft border-line",
    danger: "bg-danger/10 text-danger border-danger/20",
  };
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start justify-between gap-3 rounded-[18px] border px-3 py-2 text-sm",
        map[tone],
      )}
    >
      <div>{children}</div>
      {onClose ? (
        <button type="button" className="font-medium opacity-60" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  onClick,
  hint,
}: {
  label: string;
  value: number | string;
  onClick?: () => void;
  hint?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-[24px] border border-line bg-paper p-5 text-left shadow-card transition",
        onClick && "hover:border-ink/20 hover:shadow-card",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-mid">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mid">{hint}</div> : null}
    </Comp>
  );
}

export function statusTone(status: string): React.ComponentProps<typeof Badge>["tone"] {
  const s = status.toLowerCase();
  if (["accepted", "completed", "ready", "published", "scheduled", "open", "mock_sent"].includes(s))
    return "ok";
  if (["submitted", "under_review", "pending", "assigned", "not_started", "draft"].includes(s)) return "warn";
  if (["rejected", "declined", "overdue", "conflict", "not_ready", "closed"].includes(s)) return "danger";
  if (["in_review", "waitlisted"].includes(s)) return "info";
  return "muted";
}

export function Spinner() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm font-medium text-mid" role="status">
      Loading…
    </div>
  );
}

/**
 * Standard load state for organizer pages: spinner while in flight, and an explicit
 * error / timed-out panel with a Retry button instead of an endless "Loading…".
 */
export function LoadState({
  loading,
  timedOut,
  error,
  onRetry,
  label = "this page",
}: {
  loading: boolean;
  timedOut: boolean;
  error?: string;
  onRetry: () => void;
  label?: string;
}) {
  if (loading) return <Spinner />;
  if (!timedOut && !error) return null;
  return (
    <div className="rounded-[24px] border border-line bg-paper p-6" role="status" aria-live="polite">
      <h3 className="text-base font-semibold text-ink">
        {error ? `Could not load ${label}` : `Still loading ${label}`}
      </h3>
      <p className="mt-2 max-w-xl text-sm text-mid">
        {error ||
          "This is taking longer than expected. The server may be waking up or the request was dropped."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onRetry}>Retry</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    </div>
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn("text-sm leading-relaxed text-ink-soft [&_strong]:font-semibold [&_strong]:text-ink", className)}
      dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(text) }}
    />
  );
}

/* ——— Toasts ——— */
type ToastTone = "ok" | "warn" | "danger" | "info";
type ToastItem = { id: string; message: string; tone: ToastTone };

let toastPush: ((t: Omit<ToastItem, "id">) => void) | null = null;

export function toast(message: string, tone: ToastTone = "ok") {
  toastPush?.({ message, tone });
}

export function ToastViewport() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    toastPush = (t) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { ...t, id }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, 3200);
    };
    return () => {
      toastPush = null;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(100%-2rem,360px)] flex-col gap-2"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-[18px] border px-4 py-3 text-sm font-medium shadow-card",
            t.tone === "ok" && "border-line bg-paper text-ink",
            t.tone === "warn" && "border-line bg-canvas text-ink",
            t.tone === "danger" && "border-danger/20 bg-danger/10 text-danger",
            t.tone === "info" && "border-line bg-soft text-ink",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ——— Dialog ——— */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cue-dialog-title"
        className="relative z-10 w-full max-w-lg rounded-[24px] border border-line bg-paper p-5 shadow-card"
      >
        <h2 id="cue-dialog-title" className="text-lg font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-mid">{description}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
