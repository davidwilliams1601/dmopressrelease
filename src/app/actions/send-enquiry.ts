'use server';

export interface EnquiryData {
  name: string;
  organisation: string;
  email: string;
  message: string;
}

export async function sendEnquiry(
  data: EnquiryData
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const toEmail = process.env.ENQUIRY_TO_EMAIL;
  const fromEmail = process.env.ENQUIRY_FROM_EMAIL;

  if (!apiKey || !toEmail || !fromEmail) {
    console.error('Missing SendGrid environment variables for enquiry form');
    return { success: false, error: 'Server configuration error. Please try again later.' };
  }

  const body = {
    personalizations: [
      {
        to: [{ email: toEmail }],
        subject: `New PressPilot Enquiry from ${data.name} (${data.organisation})`,
      },
    ],
    from: { email: fromEmail, name: 'PressPilot Website' },
    reply_to: { email: data.email, name: data.name },
    content: [
      {
        type: 'text/html',
        value: `
          <h2>New Enquiry from PressPilot Landing Page</h2>
          <table cellpadding="8" style="border-collapse:collapse;">
            <tr><td><strong>Name</strong></td><td>${escapeHtml(data.name)}</td></tr>
            <tr><td><strong>Organisation</strong></td><td>${escapeHtml(data.organisation)}</td></tr>
            <tr><td><strong>Email</strong></td><td><a href="mailto:${escapeHtml(data.email)}">${escapeHtml(data.email)}</a></td></tr>
          </table>
          <h3>Message</h3>
          <p style="white-space:pre-wrap;">${escapeHtml(data.message)}</p>
        `,
      },
    ],
  };

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('SendGrid error:', response.status, text);
      return { success: false, error: 'Failed to send message. Please try again.' };
    }

    return { success: true };
  } catch (err) {
    console.error('Enquiry send error:', err);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
