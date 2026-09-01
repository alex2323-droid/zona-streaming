export async function sendEmail(token: string | null, to: string, subject: string, body: string, isHtml: boolean = false) {
  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, subject, body, isHtml }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to send email');
  }

  return response.json();
}

