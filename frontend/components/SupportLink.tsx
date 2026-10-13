const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL;

/** "o suporte" as a link when NEXT_PUBLIC_SUPPORT_URL is set at build time (mailto:, wa.me or a page). */
export function SupportLink() {
  if (!SUPPORT_URL) return <>o suporte</>;
  const external = /^https?:/.test(SUPPORT_URL);
  return (
    <a href={SUPPORT_URL} {...(external && { target: "_blank", rel: "noreferrer" })}
      className="py-1 text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent pointer-coarse:py-3.5">
      o suporte
    </a>
  );
}
