import type { ReactNode } from 'react';

/**
 * The frame every auth screen sits in. Kept separate from the pages so the sign-in, sign-up and
 * reset screens cannot drift apart visually as copy changes.
 *
 * `highlight` colours one phrase of the title — the product name — without splitting the title
 * across translation keys, so each language keeps its own word order.
 */
export function AuthCard({
  title,
  highlight,
  subtitle,
  children,
  footer,
}: {
  title: string;
  highlight?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          <HighlightedTitle title={title} highlight={highlight} />
        </h1>
        {subtitle ? <p className="text-base leading-relaxed text-slate-500">{subtitle}</p> : null}
      </div>

      <div className="mt-8">{children}</div>

      {footer ? <div className="mt-8 text-center text-sm text-slate-600">{footer}</div> : null}
    </div>
  );
}

function HighlightedTitle({ title, highlight }: { title: string; highlight?: string }) {
  const at = highlight ? title.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <>{title}</>;

  return (
    <>
      {title.slice(0, at)}
      <span className="text-[#0066FF]">{highlight}</span>
      {title.slice(at + highlight.length)}
    </>
  );
}
