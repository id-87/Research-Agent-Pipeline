# Brokai Lead Intelligence System

A multi-agent pipeline that takes a list of companies, autonomously researches each one, finds contact information, and generates personalised cold outreach messages — ready to send.

## Architecture

Three specialised agents run in sequence per company:

| Agent | Role | Output |
|---|---|---|
| 01 Researcher | Searches the web to build a business profile | Company description, industry, size signals, digital presence, existing tools |
| 02 Contact Finder | Scrapes website, Google, IndiaMART, Justdial for contact info | Phone, email, WhatsApp, source URL |
| 03 Outreach Writer | Uses profile + contact card to write a personalised WhatsApp message | Ready-to-send cold outreach |

Results stream to the UI via Server-Sent Events as each company completes.

## Stack

- **Frontend**: React (CRA)
- **Backend**: Express.js + Node.js
- **LLM**: Groq (llama3-70b-8192) via `groq-sdk`
- **Web Research**: Google search + Cheerio scraping (free, no paid APIs)
- **File Parsing**: `xlsx` library

## Local Setup

### Prerequisites
- Node.js 18+
- A free Groq API key from [console.groq.com](https://console.groq.com)

### 1. Clone the repo
```bash
git clone <your-repo-url>
cd brokai-lead-intel
```

### 2. Install dependencies
```bash
npm run install:all
```

### 3. Configure environment
```bash
cp server/.env.example server/.env
```
Edit `server/.env` and add your Groq API key:
```
GROQ_API_KEY=gsk_your_key_here
PORT=5000
```

### 4. Run locally
In two terminals:
```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm start
```

App runs at `http://localhost:3000`

## Input Format

Upload an Excel (.xlsx / .xls) or CSV file:
- **Column A**: Company Name (required)
- **Column B**: Location (optional, improves research accuracy)
- First row can be a header row — it will be auto-skipped
- Maximum 20 companies per batch

## Deployment (Render)

1. Push to GitHub
2. Create a **Web Service** on Render pointing to the repo
3. Set build command: `npm run install:all && npm run build`
4. Set start command: `npm start`
5. Add environment variable: `GROQ_API_KEY`
6. Set `NODE_ENV=production`

## Environment Variables

See `server/.env.example`:

```
GROQ_API_KEY=       # Required — Groq API key
PORT=5000           # Optional — defaults to 5000
```

## Failure Handling

- If contact info is not publicly available, the contact card shows a clear fallback message — the pipeline does not crash or skip the row.
- If the LLM returns malformed JSON, the agent falls back to a safe default profile.
- If web scraping fails (timeout, 403), the agent proceeds with whatever data was collected.
- All three agents always produce output, even under error conditions.

## Deployed URL

[Add your deployed URL here]
