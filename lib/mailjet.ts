type MailjetRecipient = {
  email: string;
  name?: string;
};

interface SendMailjetEmailParams {
  to: MailjetRecipient[];
  subject: string;
  textPart: string;
  htmlPart: string;
  customId?: string;
}

export async function sendMailjetEmail({
  to,
  subject,
  textPart,
  htmlPart,
  customId,
}: SendMailjetEmailParams): Promise<boolean> {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_SECRET_KEY;
  const fromEmail = process.env.MAILJET_FROM_EMAIL;
  const fromName = process.env.MAILJET_FROM_NAME || 'Modoo';

  if (!apiKey || !apiSecret || !fromEmail) {
    console.error('Mailjet environment variables are not configured.');
    return false;
  }

  const payload = {
    Messages: [
      {
        From: {
          Email: fromEmail,
          Name: fromName,
        },
        To: to.map((recipient) => ({
          Email: recipient.email,
          Name: recipient.name || recipient.email,
        })),
        Subject: subject,
        TextPart: textPart,
        HTMLPart: htmlPart,
        CustomID: customId,
      },
    ],
  };

  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Mailjet send failed:', response.status, errorBody);
    return false;
  }

  return true;
}
