const SWATCHES: [string, string][] = [
  ["Primary / buttons", "#FF6500"],
  ["Accent gold", "#F7B733"],
  ["Ink (text)", "#302B27"],
  ["Muted", "#716B65"],
  ["Line", "#E6DDD3"],
  ["Paper (page bg)", "#FAF8F4"],
  ["Card", "#FFFDF9"],
  ["Money", "#C95A12"],
  ["Success", "#1E8E3E"],
];

export function resolvePreviewAppUrl(): string {
  // APP_URL may be unset locally; siteUrl() never throws and resolves from
  // SITE_URL / APP_URL / Vercel env, so the preview still renders links and
  // images without ever pointing at a deleted deployment.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { siteUrl } = require("@/lib/site-url");
  return siteUrl() as string;
}

export function EmailPreview({
  title,
  subject,
  htmlContent,
  textContent,
}: {
  title: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}) {
  return (
    <main className="page-shell">
      <section className="section container">
        <h1>Preview: {title}</h1>
        <p className="muted">
          Subject: <strong>{subject}</strong> · Table layout, inline CSS, 600px max width. Tokens
          from <code>app/globals.css</code>:
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 20px" }}>
          {SWATCHES.map(([label, hex]) => (
            <span
              key={hex + label}
              className="badge"
              style={{ background: "#fff", border: "1px solid var(--line)" }}
              title={label}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 4,
                  background: hex,
                  marginRight: 6,
                  verticalAlign: "baseline",
                  border: "1px solid #00000022",
                }}
              />
              {hex}
            </span>
          ))}
        </div>
        <h2>HTML</h2>
        <iframe
          title={`${title} preview`}
          srcDoc={htmlContent}
          style={{ width: "100%", height: 900, border: "1px solid var(--line)", borderRadius: 16 }}
        />
        <h2 style={{ marginTop: 28 }}>Plain text fallback</h2>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: 20,
            fontSize: 14,
          }}
        >
          {textContent}
        </pre>
      </section>
    </main>
  );
}
