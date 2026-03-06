'use strict';

const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends a combined recipe email: title, link and shopping list in one message.
 * Throws if SMTP is not configured or sending fails.
 */
async function sendRecipeEmail(recipe, toEmail) {
  if (!isSmtpConfigured()) {
    throw new Error(
      'SMTP nicht konfiguriert. Bitte SMTP_HOST, SMTP_USER und SMTP_PASS in der .env hinterlegen.'
    );
  }

  const numberedList = recipe.ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n');
  const safeTitle = escapeHtml(recipe.title);
  const safeUrl = escapeHtml(recipe.url);
  const safeHtmlList = recipe.ingredients.map((ing) => `<li>${escapeHtml(ing)}</li>`).join('');

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: `Rezept: ${recipe.title}`,
    text: `${recipe.title}\n${recipe.url}\n\nEinkaufsliste:\n\n${numberedList}\n\nGuten Appetit!`,
    html: `
      <h2 style="color:#2d6a4f; margin-bottom:8px">${safeTitle}</h2>
      <p style="margin-bottom:16px">
        <a href="${safeUrl}" style="color:#2d6a4f; font-size:16px">&#8594; Zum Rezept</a>
      </p>
      <h3 style="margin-bottom:8px">Einkaufsliste</h3>
      <ol style="font-size:16px; line-height:1.8">${safeHtmlList}</ol>
      <p style="margin-top:16px">Guten Appetit!</p>
    `,
  });
}

module.exports = { isSmtpConfigured, sendRecipeEmail };
