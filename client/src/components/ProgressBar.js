import React from "react";
import "./ProgressBar.css";

function ProgressBar({ current, total, company }) {
  const pct = total > 0 ? Math.round(((current) / total) * 100) : 0;

  return (
    <div className="progress-wrap">
      <div className="progress-header">
        <span className="progress-label">RUNNING PIPELINE</span>
        <span className="progress-count">{current} / {total}</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-status">
        <span className="progress-spinner" />
        <span className="progress-company">Processing: <strong>{company}</strong></span>
        <span className="progress-pct">{pct}%</span>
      </div>
      <div className="agent-steps">
        <span className="step active">01 Researcher</span>
        <span className="step-line" />
        <span className="step active">02 Contact Finder</span>
        <span className="step-line" />
        <span className="step active">03 Outreach Writer</span>
      </div>
    </div>
  );
}

export default ProgressBar;
