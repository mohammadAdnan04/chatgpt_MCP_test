const nodemailer = require("nodemailer");

// 🔒 CHANGED: Using standard SMTP instead of the vulnerable plugin
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS, // Your Gmail App Password
  },
});

module.exports = async function sendEmail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: `"Mawsool AI" <${process.env.EMAIL_USER}>`, 
      to,
      subject,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333333;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f4;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    padding: 20px;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    padding-bottom: 20px;
                }
                .header h1 {
                    color: #04145C;
                    font-size: 24px;
                    margin: 0;
                }
                .content {
                    padding: 20px;
                    text-align: center;
                }
                .content p {
                    margin: 0 0 15px;
                }
                .button {
                    display: inline-block;
                    padding: 12px 24px;
                    background-color: #04145C;
                    color: #ffffff !important;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    margin: 20px 0;
                }
                .button:hover {
                    background-color: #0a2b8c;
                }
                .footer {
                    text-align: center;
                    font-size: 12px;
                    color: #666666;
                    padding-top: 20px;
                    border-top: 1px solid #e0e0e0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${process.env.CLIENT_URL}/basic/logo.png" alt="Mawsool AI Logo" style="height: 26px; width:145px; margin-top: 10px;" />
                </div>
                <div class="content">
                    ${html}
                </div>
                <div class="footer">
                    <p>Copyright © 2025 Mawsool AI. All rights reserved.</p>
                    <p>
                        <a href="https://mawsool.tech/privacy-policy" style="color: #666666; text-decoration: underline;">Privacy Policy</a> | 
                        <a href="https://mawsool.tech/terms-of-service" style="color: #666666; text-decoration: underline;">Terms of Service</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
      `,
    });
    console.log(`✅ Email sent successfully to ${to}`);
  } catch (err) {
    console.error("❌ Error sending email:", err);
    throw new Error(`Failed to send email: ${err.message}`);
  }
};