// Isolated, removable feature. Renders nothing unless NEXT_PUBLIC_SHOW_CONNECT === "true".
// Deleting this file + its single <ConnectWithClaude/> usage fully removes the feature from the UI.

const CONNECTOR_NAME = "GIFT City Times";
const CONNECTOR_URL = "https://giftcitytimes.com/api/mcp";

export default function ConnectWithClaude() {
  if (process.env.NEXT_PUBLIC_SHOW_CONNECT !== "true") return null;

  const deepLink =
    "https://claude.ai/customize/connectors?modal=add-custom-connector" +
    `&connectorName=${encodeURIComponent(CONNECTOR_NAME)}` +
    `&connectorUrl=${encodeURIComponent(CONNECTOR_URL)}`;

  return (
    <section
      aria-label="Connect with Claude"
      style={{
        maxWidth: 560,
        margin: "28px auto 4px",
        padding: "18px 20px",
        border: "1px solid var(--rule, #d9d2c2)",
        background: "var(--paper-2, #f7f3ea)",
        textAlign: "center",
        borderRadius: 2,
      }}
    >
      <div style={{ font: "700 11px/1 Arial, sans-serif", letterSpacing: 2, textTransform: "uppercase", color: "var(--accent, #7a1f1f)" }}>
        New · Daily brief in Claude
      </div>
      <p style={{ margin: "10px 0 14px", fontFamily: "Georgia, serif", fontSize: 15, lineHeight: 1.5, color: "var(--ink, #1a1712)" }}>
        Get your GIFT IFSC morning brief, verify entities, and build a daily streak — right inside Claude.
      </p>
      <a
        href={deepLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          background: "#3f1212",
          color: "#f3e9e0",
          font: "700 12px/1 Arial, sans-serif",
          letterSpacing: 1,
          textDecoration: "none",
          padding: "12px 22px",
          borderRadius: 2,
        }}
      >
        + Connect with Claude
      </a>
      <div style={{ marginTop: 10, font: "400 11px/1.4 Arial, sans-serif", color: "var(--muted, #8a8172)" }}>
        Free · Opens Claude to add the connector
      </div>
    </section>
  );
}
