const nodemailer = require('nodemailer');

const createTransporter = () => {
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  const host = process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_SMTP_PORT || 465);
  const secure = String(process.env.EMAIL_SMTP_SECURE || 'true') !== 'false';

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
};

const sendEmailNotification = async ({ to, subject, text }) => {
  if (!to || !subject || !text) {
    return { sent: false, skipped: true };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, skipped: true };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
    to,
    subject,
    text
  });

  return { sent: true, skipped: false };
};

module.exports = {
  sendEmailNotification
};
