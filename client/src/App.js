import React, { useState } from "react";
import Header from "./components/Header";
import UploadPanel from "./components/UploadPanel";
import ResultsTable from "./components/ResultsTable";
import ProgressBar from "./components/ProgressBar";
import { runPipeline } from "./lib/api";
import "./App.css";

function App() {
  const [companies, setCompanies] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, company: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = (parsed) => {
    setCompanies(parsed);
    setResults([]);
    setDone(false);
    setError(null);
  };

  const handleRun = async () => {
    if (companies.length === 0) return;
    setProcessing(true);
    setResults([]);
    setDone(false);
    setError(null);
    setProgress({ current: 0, total: companies.length, company: "" });

    try {
      await runPipeline(
        companies,
        (event) => {
          setProgress({ current: event.index + 1, total: companies.length, company: event.company });
        },
        (event) => {
          setResults((prev) => [...prev, event.data]);
        },
        () => {
          setDone(true);
          setProcessing(false);
        }
      );
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setCompanies([]);
    setResults([]);
    setDone(false);
    setError(null);
    setProcessing(false);
    setProgress({ current: 0, total: 0, company: "" });
  };

  return (
    <div className="app">
      <Header />
      <main className="main">
        {!processing && !done && (
          <UploadPanel
            companies={companies}
            onUpload={handleUpload}
            onRun={handleRun}
            onReset={handleReset}
          />
        )}
        {(processing || done) && (
          <>
            {processing && (
              <ProgressBar
                current={progress.current}
                total={progress.total}
                company={progress.company}
              />
            )}
            {results.length > 0 && (
              <ResultsTable results={results} processing={processing} />
            )}
            {done && (
              <div className="done-bar">
                <span className="done-text">✓ Pipeline complete — {results.length} companies processed</span>
                <button className="btn-ghost" onClick={handleReset}>Run New Batch</button>
              </div>
            )}
          </>
        )}
        {error && (
          <div className="error-banner">
            <span>⚠ {error}</span>
            <button onClick={handleReset}>Reset</button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
