const { callLLM } = require("../lib/llm");

const SYSTEM_PROMPT = `You are an outreach copywriter for Brokai Labs — an AI systems company that builds voice receptionists, SaaS platforms, and automation tools for small and medium businesses.

Write a WhatsApp-style cold outreach message that:
- Is short (4-6 lines max)
- Opens with the specific business context (what they do, their pain point)
- Mentions ONE relevant Brokai product that fits their needs
- Ends with a soft CTA (a question or "want to see how?")
- Sounds like a human wrote it, not a bot
- No emojis overload (1-2 max)
- No generic intros like "Hope this finds you well"
- Never mention that you found them online

Brokai products to reference based on fit:
- Voice Receptionist: for businesses that miss calls, have reception gaps
- Booking Automation: for salons, clinics, service businesses
- CRM + Follow-up Automation: for businesses with leads but no follow-up system
- WhatsApp Business Automation: for businesses that use WhatsApp for customer comm
- Field Operations SaaS: for businesses with field teams or service delivery

Return ONLY the message text. No labels, no JSON, no explanation.`;

async function runOutreachWriter(profile, contactCard) {
  const userPrompt = `Write a personalised WhatsApp outreach message for this business:

Company: ${profile.companyName}
Industry: ${profile.industry}
What they do: ${profile.description}
Size signals: ${profile.sizeSignals}
Digital presence: ${profile.digitalPresence}
Existing tools: ${profile.existingTools}
Contact available: ${contactCard.phone || contactCard.email ? "Yes" : "No"}

Make it specific to their business type and likely pain points.`;

  try {
    const message = await callLLM(SYSTEM_PROMPT, userPrompt, 0.7);
    return {
      success: true,
      data: { message: message.trim() },
    };
  } catch (err) {
    return {
      success: true,
      data: {
        message: `Hi, I'm reaching out from Brokai Labs. We build AI-powered tools for businesses like ${profile.companyName} — voice receptionists, booking automation, and CRM systems. Would love to show you how we can save your team time. Interested?`,
      },
      fallback: true,
    };
  }
}

module.exports = { runOutreachWriter };
