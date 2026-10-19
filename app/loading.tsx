import { TaoBrand } from "@/components/tao-brand";

export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-10 bg-cream-50 px-6 py-16" role="status" aria-live="polite" aria-busy="true">
      <TaoBrand large animated />
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-navy-800/65">
        <span className="size-1.5 animate-pulse rounded-full bg-mint-400 motion-reduce:animate-none" aria-hidden="true" />
        Loading your workspace…
      </div>
    </main>
  );
}
