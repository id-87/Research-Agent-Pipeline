import React, { useState } from "react";
import "./ResultRow.css";

function ResultRow({ index, data, expanded, onToggle }) {
  const { companyName, profile, contact, outreach, status } = data;
  const [copied, setCopied] = useState(false);

  const copyMessage = () => {
    if (outreach?.message) {
      navigator.clipboard.writeText(outreach.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasContact = contact && (contact.phone || contact.email || contact.whatsapp);
  const isError = status === "error";

  return (
    <div className={`result-row ${expanded ? "expanded" : ""}`}>
      <div className="row-summary" onClick={onToggle}>
        <div className="col-num">
          <span className="row-num">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="col-company">
          <span className="row-company">{companyName}</span>
          {data.location && <span className="row-location">{data.location}</span>}
        </div>
        <div className="col-profile">
          <span className="row-desc">
            {profile?.description
              ? profile.description.slice(0, 90) + (profile.description.length > 90 ? "…" : "")
              : "—"}
          </span>
        </div>
        <div className="col-contact">
          {hasContact ? (
            <div className="contact-chips">
              {contact.phone && <span className="chip chip-phone">📞 {contact.phone}</span>}
              {contact.email && <span className="chip chip-email">✉ {contact.email}</span>}
              {contact.whatsapp && <span className="chip chip-wa">💬 WA</span>}
            </div>
          ) : (
            <span className="no-contact">Not found</span>
          )}
        </div>
        <div className="col-status">
          <span className={`status-badge ${isError ? "badge-error" : "badge-done"}`}>
            {isError ? "Error" : "Done"}
          </span>
        </div>
        <div className="col-expand">
          <span className="expand-icon">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="row-detail">
          <div className="detail-grid">
            <section className="detail-section">
              <h3 className="section-title">
                <span className="section-num">01</span> Business Profile
              </h3>
              <div className="detail-fields">
                <Field label="Description" value={profile?.description} />
                <Field label="Industry" value={profile?.industry} />
                <Field label="Size Signals" value={profile?.sizeSignals} />
                <Field label="Digital Presence" value={profile?.digitalPresence} />
                <Field label="Existing Tools" value={profile?.existingTools} />
                {profile?.websiteUrl && (
                  <div className="detail-field">
                    <span className="field-label">Website</span>
                    <a
                      className="field-link"
                      href={profile.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {profile.websiteUrl}
                    </a>
                  </div>
                )}
              </div>
            </section>

            <section className="detail-section">
              <h3 className="section-title">
                <span className="section-num">02</span> Contact Information
              </h3>
              {contact?.fallback ? (
                <div className="fallback-notice">
                  <span className="fallback-icon">⚠</span>
                  <span>{contact.fallbackMessage || "No publicly available contact information found."}</span>
                </div>
              ) : (
                <div className="detail-fields">
                  <Field label="Phone" value={contact?.phone} />
                  <Field label="Email" value={contact?.email} />
                  <Field label="WhatsApp" value={contact?.whatsapp} />
                  <Field label="Address" value={contact?.address} />
                  {contact?.sourceUrl && (
                    <div className="detail-field">
                      <span className="field-label">Source</span>
                      <a
                        className="field-link"
                        href={contact.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {contact.sourceUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="detail-section outreach-section">
              <div className="outreach-header">
                <h3 className="section-title">
                  <span className="section-num">03</span> Outreach Message
                </h3>
                <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyMessage}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <div className="outreach-bubble">
                <p className="outreach-text">{outreach?.message || "No message generated."}</p>
              </div>
            </section>
          </div>

          {isError && data.error && (
            <div className="row-error">
              <span>Pipeline error: {data.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  if (!value || value === "Not found" || value === "Unknown") {
    return (
      <div className="detail-field">
        <span className="field-label">{label}</span>
        <span className="field-empty">—</span>
      </div>
    );
  }
  return (
    <div className="detail-field">
      <span className="field-label">{label}</span>
      <span className="field-value">{value}</span>
    </div>
  );
}

export default ResultRow;
