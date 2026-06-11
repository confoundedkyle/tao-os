import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Design-system primitives — DESIGN.md §6–7.

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary:
    "inline-flex items-center gap-2 rounded-chip bg-mint-400 px-7 py-3 font-bold text-navy-800 transition duration-150 ease-out hover:brightness-105 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:brightness-100",
  secondary:
    "inline-flex items-center gap-2 rounded-chip border-[1.5px] border-navy-800/25 px-7 py-3 font-semibold text-navy-800 transition duration-150 ease-out hover:border-navy-800 disabled:opacity-50",
  small:
    "inline-flex items-center gap-1.5 rounded-chip bg-mint-400 px-4 py-1.5 text-sm font-bold text-navy-800 transition duration-150 ease-out hover:brightness-105 disabled:opacity-50",
  smallSecondary:
    "inline-flex items-center gap-1.5 rounded-chip border-[1.5px] border-navy-800/25 px-4 py-1.5 text-sm font-semibold text-navy-800 transition duration-150 ease-out hover:border-navy-800 disabled:opacity-50",
  danger:
    "inline-flex items-center gap-1.5 rounded-chip border-[1.5px] border-coral-400/50 px-4 py-1.5 text-sm font-semibold text-coral-400 transition duration-150 ease-out hover:border-coral-400 disabled:opacity-50",
};

export type ButtonVariant = keyof typeof buttonStyles;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(buttonStyles[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonStyles[variant], className)} {...props} />;
}

export function Card({
  className,
  children,
  featured,
}: {
  className?: string;
  children: ReactNode;
  featured?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-card border bg-white p-6 transition duration-150 ease-out",
        featured ? "border-mint-400/60 shadow-lift" : "border-navy-800/12",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Chip({
  tone = "mint",
  children,
  className,
}: {
  tone?: "mint" | "amber" | "navy" | "coral" | "sky";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    mint: "bg-mint-400/22 text-mint-700",
    amber: "bg-amber-400/22 text-amber-400",
    navy: "bg-navy-800/8 text-navy-800/70",
    coral: "bg-coral-400/22 text-coral-400",
    sky: "bg-sky-300/30 text-navy-800/80",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-chip px-2.5 py-0.5 text-[13px] font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Mono({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("font-mono text-[13px] text-navy-800/70", className)}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold leading-tight sm:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-[68ch] text-navy-800/55">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-navy-800/15 bg-cream-100/60 px-8 py-14 text-center">
      {icon}
      <h3 className="text-xl font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-[48ch] text-navy-800/55">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export const inputClass =
  "w-full rounded-chip border border-navy-800/20 bg-white px-3.5 py-2.5 text-navy-800 outline-none transition focus:border-mint-700 placeholder:text-navy-800/35";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-sm text-navy-800/45">{hint}</span>
      ) : null}
    </label>
  );
}
