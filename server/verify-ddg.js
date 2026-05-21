require("dotenv").config();
const { webSearch } = require("./src/lib/scraper");
const { runResearcher } = require("./src/agents/researcher");

async function verifyDDG() {
    console.log("--- Testing DuckDuckGo Search ---");
    const query = "OpenAI company info";
    const links = await webSearch(query, 3);
    console.log(`Query: ${query}`);
    console.log(`Links found: ${links.length} results`);
    if (links.length > 0) {
        console.log(`First link: ${links[0]}`);
    }

    console.log("\n--- Testing Grounded Researcher ---");
    const result = await runResearcher("A Non-Existent Company Name 12345", "Antarctica");
    console.log("Result (should be conservative):");
    console.log(JSON.stringify(result.data, null, 2));
}

verifyDDG().catch(console.error);
