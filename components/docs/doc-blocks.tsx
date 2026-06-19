import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Page title + optional lead paragraph, consistent across all docs pages. */
export function DocHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-mint-700">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
        {title}
      </h1>
      {lead && <p className="mt-3 text-lg text-navy-800/60">{lead}</p>}
    </header>
  );
}

/** A titled section block. */
export function DocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 font-display text-xl font-semibold text-navy-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Render a Markdown string with the app's prose styling. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-calyflow">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
