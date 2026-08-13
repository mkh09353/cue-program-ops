import * as React from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, formatStatus, renderSimpleMarkdown } from "../lib/utils";

// Ruckus Brand Paper: pill buttons, violet primary, ring-based (not border-based)
// secondary treatments, and the tactile `ruckus-press` translate on :active that
// the marketing page uses. Focus is the app-wide violet ring.
export const buttonVariants = cva(
  "ruckus-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
        secondary: "bg-white text-ink ring-1 ring-brand-200 hover:ring-brand-400",
        outline: "bg-white text-ink ring-1 ring-line hover:ring-brand-200",
        ghost: "bg-transparent text-mid hover:bg-brand-50 hover:text-ink",
        danger: "bg-danger text-white shadow-sm hover:bg-danger/90",
        dark: "bg-ink text-soft hover:bg-ink-soft",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-full px-3 text-xs",
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

export function Card({
  className,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Opt-in landing-page lift: raises and warms the border on hover. */
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line bg-paper shadow-sm transition",
        hover && "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card",
        className,
      )}
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
  // Semantic status tones (emerald / amber / rose / violet / neutral), matching the
  // landing page's mock UI. Kept at text-xs — the marketing mock's 10px pills would
  // not clear AA at these tints. Ring-based, not border-based.
  const tones: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warn: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    info: "bg-brand-50 text-brand-700 ring-brand-200",
    muted: "bg-neutral-100 text-neutral-700 ring-neutral-200",
    ai: "bg-brand-50 text-brand-700 ring-brand-200",
    primary: "bg-brand-600 text-white ring-brand-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide ring-1",
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
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Small uppercase kicker above the title, as on the marketing sections. */
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? (
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-mid">{eyebrow}</div>
        ) : null}
        {/* font-display (Baloo 2) is deliberately limited to page titles and the
            brand lockup — body copy stays on Geist. */}
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-ink sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-mid">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const fieldControl =
  "h-9 w-full rounded-full bg-white px-3 text-sm text-ink outline-none ring-1 ring-line placeholder:text-mid focus:ring-2 focus:ring-brand-400";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldControl, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-2xl bg-white px-3 py-2 text-sm text-ink outline-none ring-1 ring-line placeholder:text-mid focus:ring-2 focus:ring-brand-400",
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
    <div className="rounded-3xl border border-dashed border-brand-200 bg-paper p-8 text-center">
      <span
        aria-hidden
        className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-2xl bg-brand-100 text-brand-700 ring-1 ring-brand-200"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M9 10v10" />
        </svg>
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-mid">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ——— Table ———
 * One table treatment for every list in the app: a rounded, bordered, scrollable
 * shell; a soft uppercase header row; hairline row separators. Pages keep their
 * own columns, testids and cell content — only the chrome is shared.
 */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto rounded-3xl border border-line bg-paper shadow-sm", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-left text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-line bg-soft text-[11px] uppercase tracking-wide text-mid",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-3 font-medium", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-top", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-t border-line", className)} {...props} />;
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
    info: "bg-brand-50 text-ink border-brand-200",
    ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warn: "bg-amber-50 text-amber-900 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start justify-between gap-3 rounded-2xl border px-3 py-2 text-sm",
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
        "rounded-3xl border border-line bg-paper p-4 text-left shadow-sm transition",
        onClick && "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-mid">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mid">{hint}</div> : null}
    </Comp>
  );
}

/**
 * Map a domain status onto a semantic badge tone.
 * ok = emerald (terminal good), warn = amber (needs action), danger = rose,
 * info = violet (in flight), muted = neutral.
 */
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
    <div className="rounded-3xl border border-line bg-paper p-6 shadow-sm" role="status" aria-live="polite">
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
            "pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-medium shadow-card",
            t.tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            t.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
            t.tone === "danger" && "border-rose-200 bg-rose-50 text-rose-700",
            t.tone === "info" && "border-brand-200 bg-brand-50 text-ink",
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
        className="relative z-10 w-full max-w-lg rounded-3xl border border-line bg-paper p-5 shadow-lift"
      >
        <h2 id="cue-dialog-title" className="font-display text-lg font-extrabold tracking-[-0.03em] text-ink">
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

/** One selectable row in a {@link ChipCombobox}. */
export type ComboOption = { id: string; label: string; sublabel?: string };

/**
 * Compact combobox that stays one row high at rest.
 *
 * Multi mode renders the selection as removable chips inline with the text input
 * (Backspace removes the last chip); single mode shows the current value in the
 * input. Typing opens a floating listbox of matches; ArrowUp/ArrowDown move the
 * active option, Enter selects it, Escape and blur close. An optional onCreate
 * offers "Create …" when the query matches nothing.
 *
 * Replaces both a native <select multiple> (cramped, ctrl-click only) and a tall
 * checkbox-card list, which made the New session card enormous.
 */
export function ChipCombobox({
  options,
  value,
  onChange,
  multiple = false,
  idPrefix,
  label,
  placeholder,
  onCreate,
  createLabel = (query: string) => `Create "${query}"`,
  emptyLabel = "No matches",
  invalid = false,
}: {
  options: ComboOption[];
  /** Multi mode: selected ids. Single mode: the selected id (or ""). */
  value: string[] | string;
  onChange: (next: any) => void;
  multiple?: boolean;
  idPrefix: string;
  label: string;
  placeholder?: string;
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
  emptyLabel?: string;
  invalid?: boolean;
}) {
  const selectedIds = React.useMemo(
    () => (multiple ? ((value as string[]) || []) : value ? [value as string] : []),
    [multiple, value],
  );
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = `${idPrefix}-listbox`;

  const needle = query.trim().toLowerCase();
  const matches = React.useMemo(() => {
    const pool = multiple ? options.filter((o) => !selectedIds.includes(o.id)) : options;
    if (!needle) return pool;
    return pool.filter((o) => `${o.label} ${o.sublabel || ""}`.toLowerCase().includes(needle));
  }, [options, multiple, selectedIds, needle]);

  const exact = options.some((o) => o.label.trim().toLowerCase() === needle);
  const canCreate = Boolean(onCreate && needle && !exact);
  const rowCount = matches.length + (canCreate ? 1 : 0);

  React.useEffect(() => setActive(0), [needle, open]);
  // Close when focus or a click leaves the component.
  React.useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const select = (option: ComboOption) => {
    if (multiple) {
      onChange([...new Set([...selectedIds, option.id])]);
      setQuery("");
      setOpen(true); // stay open so several can be added in a row
    } else {
      onChange(option.id);
      setQuery("");
      setOpen(false);
    }
  };

  const create = async () => {
    if (!onCreate) return;
    await onCreate(query.trim());
    setQuery("");
    setOpen(false);
  };

  const commitActive = () => {
    if (canCreate && active === matches.length) return void create();
    const option = matches[active];
    if (option) select(option);
  };

  const singleLabel = !multiple && value ? options.find((o) => o.id === value)?.label || "" : "";

  return (
    <div ref={rootRef} className="relative" data-testid={`${idPrefix}-combobox`}>
      <div
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1 rounded-2xl bg-white px-2 py-1 ring-1",
          invalid ? "ring-rose-400" : "ring-line",
        )}
        onClick={() => rootRef.current?.querySelector("input")?.focus()}
      >
        {multiple
          ? selectedIds.map((id) => {
              const option = options.find((o) => o.id === id);
              return (
                <span
                  key={id}
                  data-testid={`${idPrefix}-chip-${id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200"
                >
                  {option?.label || id}
                  <button
                    type="button"
                    aria-label={`Remove ${option?.label || id}`}
                    data-testid={`${idPrefix}-remove-${id}`}
                    className="text-mid hover:text-ink"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(selectedIds.filter((x) => x !== id));
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })
          : null}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          data-testid={`${idPrefix}-input`}
          className="min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
          placeholder={multiple ? (selectedIds.length ? "" : placeholder) : singleLabel || placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              // Opening with ArrowDown should land on the FIRST row, not the second.
              if (!open) {
                setOpen(true);
                setActive(0);
                return;
              }
              setActive((i) => (rowCount ? (i + 1) % rowCount : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (rowCount ? (i - 1 + rowCount) % rowCount : 0));
            } else if (e.key === "Enter") {
              if (!open) return;
              e.preventDefault();
              commitActive();
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !query && multiple && selectedIds.length) {
              onChange(selectedIds.slice(0, -1));
            }
          }}
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          data-testid={`${idPrefix}-listbox`}
          className="absolute left-0 right-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-line bg-paper py-1 shadow-lift"
        >
          {matches.map((option, index) => (
            <li
              key={option.id}
              role="option"
              aria-selected={selectedIds.includes(option.id)}
              data-testid={`${idPrefix}-option-${option.id}`}
              className={cn("cursor-pointer px-3 py-1.5 text-sm", index === active ? "bg-brand-50" : "")}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(option);
              }}
            >
              <b className="block truncate font-medium">{option.label}</b>
              {option.sublabel ? <span className="block truncate text-xs text-mid">{option.sublabel}</span> : null}
            </li>
          ))}
          {canCreate ? (
            <li
              role="option"
              aria-selected={false}
              data-testid={`${idPrefix}-create`}
              className={cn("cursor-pointer px-3 py-1.5 text-sm", active === matches.length ? "bg-brand-50" : "")}
              onMouseEnter={() => setActive(matches.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              {createLabel(query.trim())}
            </li>
          ) : null}
          {!rowCount ? (
            <li className="px-3 py-1.5 text-sm text-mid" data-testid={`${idPrefix}-empty`}>
              {emptyLabel}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
