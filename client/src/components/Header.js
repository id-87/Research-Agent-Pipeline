import React from "react";
import "./Header.css";

function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-logo">
          {/* <span className="logo-mark">B</span> */}
          <span className="logo-text">Outreach Agent</span>
          {/* <span className="logo-tag">LABS</span> */}
        </div>
        <div className="header-product">
          <span className="header-pill">LEAD INTELLIGENCE SYSTEM</span>
        </div>
        <div className="header-status">
          <span className="status-dot" />
          <span className="status-label">PIPELINE READY</span>
        </div>
      </div>
    </header>
  );
}

export default Header;
