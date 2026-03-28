const { runResearcher } = require("../agents/researcher");
const { runContactFinder } = require("../agents/contactFinder");
const { runOutreachWriter } = require("../agents/outreachWriter");

async function runPipeline(companyName, location = "") {
  const result = {
    companyName,
    location,
    status: "processing",
    profile: null,
    contact: null,
    outreach: null,
    error: null,
  };

  try {
    const researchResult = await runResearcher(companyName, location);
    result.profile = researchResult.data;

    const contactResult = await runContactFinder(result.profile);
    result.contact = {
      ...contactResult.data,
      fallback: contactResult.fallback || false,
      fallbackMessage: contactResult.message || null,
    };

    const outreachResult = await runOutreachWriter(result.profile, result.contact);
    result.outreach = outreachResult.data;

    result.status = "done";
  } catch (err) {
    result.status = "error";
    result.error = err.message || "Pipeline failed";

    if (!result.contact) {
      result.contact = {
        phone: null,
        email: null,
        whatsapp: null,
        address: null,
        sourceUrl: null,
        fallback: true,
        fallbackMessage: "Pipeline error — contact lookup skipped.",
      };
    }
    if (!result.outreach) {
      result.outreach = {
        message: `Hi, I'm from Brokai Labs. We help businesses like ${companyName} automate their operations with AI tools. Want to learn more?`,
      };
    }
  }

  return result;
}

module.exports = { runPipeline };
