import React, { useRef, useState } from "react";
import { uploadFile } from "../lib/api";
import "./UploadPanel.css";

function UploadPanel({ companies, onUpload, onRun, onReset }) {
  const fileRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [fileName, setFileName] = useState(null);

  const processFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setFileError("Only .xlsx, .xls, or .csv files are accepted.");
      return;
    }
    setFileError(null);
    setUploading(true);
    setFileName(file.name);

    try {
      const data = await uploadFile(file);
      onUpload(data.companies);
    } catch (err) {
      setFileError(err.message || "Could not reach server.");
      setFileName(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e) => {
    processFile(e.target.files[0]);
    e.target.value = "";
  };

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1 className="hero-title">
          Multi-Agent<br />
          <span className="hero-accent">Lead Intelligence</span>
        </h1>
        <p className="hero-sub">
          Upload a company list. Three AI agents research each business,<br />
          find contacts, and generate personalised outreach — automatically.
        </p>
        <div className="agent-flow">
          <div className="agent-node">
            <span className="agent-num">01</span>
            <span className="agent-name">Researcher</span>
            <span className="agent-desc">Business profile + digital presence</span>
          </div>
          <div className="agent-arrow">→</div>
          <div className="agent-node">
            <span className="agent-num">02</span>
            <span className="agent-name">Contact Finder</span>
            <span className="agent-desc">Phone, email, WhatsApp</span>
          </div>
          <div className="agent-arrow">→</div>
          <div className="agent-node">
            <span className="agent-num">03</span>
            <span className="agent-name">Outreach Writer</span>
            <span className="agent-desc">Personalised cold message</span>
          </div>
        </div>
      </div>

      <div className="upload-card">
        <div
          className={"dropzone" + (dragging ? " dragging" : "") + (companies.length > 0 ? " has-file" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleChange}
            style={{ display: "none" }}
          />
          {uploading ? (
            <div className="dz-state">
              <div className="spinner" />
              <span>Parsing file…</span>
            </div>
          ) : companies.length > 0 ? (
            <div className="dz-state success">
              <span className="dz-icon">✓</span>
              <span className="dz-file">{fileName}</span>
              <span className="dz-count">{companies.length} companies ready</span>
            </div>
          ) : (
            <div className="dz-state">
              <span className="dz-icon-upload">⬆</span>
              <span className="dz-label">Drop your Excel / CSV file here</span>
              <span className="dz-hint">or click to browse — .xlsx, .xls, .csv accepted</span>
            </div>
          )}
        </div>

        {fileError && <p className="file-error">⚠ {fileError}</p>}

        {companies.length > 0 && (
          <div className="company-preview">
            <p className="preview-label">COMPANIES QUEUED</p>
            <div className="preview-list">
              {companies.slice(0, 8).map((c, i) => (
                <div key={i} className="preview-item">
                  <span className="preview-index">{String(i + 1).padStart(2, "0")}</span>
                  <span className="preview-name">{c.name}</span>
                  {c.location && <span className="preview-loc">{c.location}</span>}
                </div>
              ))}
              {companies.length > 8 && (
                <div className="preview-more">+{companies.length - 8} more</div>
              )}
            </div>
          </div>
        )}

        <div className="upload-actions">
          {companies.length > 0 && (
            <>
              <button className="btn-primary" onClick={onRun}>
                Run Pipeline
                <span className="btn-arrow">→</span>
              </button>
              <button className="btn-ghost" onClick={onReset}>Clear</button>
            </>
          )}
        </div>

        <div className="upload-note">
          <span>Column A: Company Name &nbsp;·&nbsp; Column B: Location (optional) &nbsp;·&nbsp; Max 20 rows</span>
        </div>
      </div>
    </div>
  );
}

export default UploadPanel;
