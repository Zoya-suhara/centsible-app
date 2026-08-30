const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // or 'outlook', 'yahoo', or custom SMTP
  auth: {
    user: process.env.EMAIL_USER, // Your email
    pass: process.env.EMAIL_PASS, // Your app password (not regular password)
  },
});

const sendResetEmail = async (email, resetLink, name = 'User') => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 500px; margin: 0 auto; padding: 20px; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; 
          text-decoration: none; 
          border-radius: 8px;
          margin: 20px 0;
        }
        .footer { font-size: 12px; color: #999; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔐 Reset Your Centsible Password</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <a href="${resetLink}" class="button">Reset Password</a>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>This link will expire in <strong>1 hour</strong>.</p>
        <div class="footer">
          <p>Centsible - Smart Personal Finance</p>
          <p>© ${new Date().getFullYear()} Centsible App</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Reset Your Centsible Password
    
    Hi ${name},
    
    We received a request to reset your password. 
    
    Click this link to reset your password: ${resetLink}
    
    This link will expire in 1 hour.
    
    If you didn't request this, you can safely ignore this email.
    
    Centsible - Smart Personal Finance
  `;

  await transporter.sendMail({
    from: `"Centsible App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset Your Centsible Password',
    text,
    html,
  });
};

module.exports = sendResetEmail;