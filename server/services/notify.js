const nodemailer = require('nodemailer');
const axios = require('axios');

exports.sendEmail = async (to, subject, text) => {
  const transporter = nodemailer.createTransport({
    service: 'admin@todysec.coml', // or your SMTP provider
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: `"Errand App" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text
  });
};

exports.sendSMS = async (phone, message) => {
  await axios.post('https://api.africastalking.com/version1/messaging', {
    username: process.env.AT_USERNAME,
    to: [phone],
    message
  }, {
    headers: {
      'apiKey': process.env.AT_APIKEY
    }
  });
};
