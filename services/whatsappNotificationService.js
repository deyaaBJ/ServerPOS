const buildRecipient = () => {
  const raw = process.env.WHATSAPP_NOTIFICATION_TO;
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits || null;
};

const sendWhatsAppNotification = async (message) => {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  const to = buildRecipient();

  if (!token || !phoneNumberId || !to || !message) {
    return { sent: false, skipped: true };
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }

  return { sent: true, skipped: false };
};

module.exports = {
  sendWhatsAppNotification
};
