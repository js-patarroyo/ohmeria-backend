import 'dotenv/config';

const apiKey = process.env.BREVO_API_KEY;
const senderEmail = process.env.MAIL_FROM_EMAIL;
const senderName = process.env.MAIL_FROM_NAME ?? 'Ohmeria';
const testTo = process.env.MAIL_TEST_TO;

async function main() {
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured');
  }

  if (!senderEmail) {
    throw new Error('MAIL_FROM_EMAIL is not configured');
  }

  if (!testTo) {
    throw new Error('MAIL_TEST_TO is not configured');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [{ email: testTo }],
      subject: 'Prueba de correo Ohmeria',
      htmlContent:
        '<html><body><h2>Prueba de correo</h2><p>Si estás leyendo esto, Brevo quedó correctamente conectado con Ohmeria.</p></body></html>',
      textContent:
        'Prueba de correo. Si estás leyendo esto, Brevo quedó correctamente conectado con Ohmeria.',
    }),
  });

  const text = await response.text();
  console.log(`Brevo status: ${response.status}`);
  console.log(text);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
