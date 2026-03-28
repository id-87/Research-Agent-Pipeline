import React, { useState } from "react";
import ResultRow from "./ResultRow";
import "./ResultsTable.css";

function ResultsTable({ results, processing }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const toggle = (i) => setExpandedIndex(expandedIndex === i ? null : i);

  return (
    <div className="results-wrap">
      <div className="results-header">
        <span className="results-title">RESULTS</span>
        <span className="results-meta">{results.length} processed{processing ? " — running…" : ""}</span>
      </div>
      <div className="results-table">
        <div className="table-head">
          <div className="col-num">#</div>
          <div className="col-company">Company</div>
          <div className="col-profile">Profile</div>
          <div className="col-contact">Contact</div>
          <div className="col-status">Status</div>
          <div className="col-expand" />
        </div>
        {results.map((r, i) => (
          <ResultRow
            key={i}
            index={i}
            data={r}
            expanded={expandedIndex === i}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
    </div>
  );
}

export default ResultsTable;
