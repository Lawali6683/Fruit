const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

module.exports = (req, res) => {
  // Check the request method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check the origin header to verify the domain
  const origin = req.headers.origin;
  if (origin !== 'https://agrofruit.pages.dev') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Return the Paystack secret key
  res.status(200).json({ secretKey: PAYSTACK_SECRET_KEY });
};
