const express = require('express');
const app = express();

// Manual/testing lookup — you supply the number in the URL
app.get('/api/check-status/:msisdn/:serviceId', async (req, res) => {
  const { msisdn, serviceId } = req.params;
  const upstream = await fetch(`http://mobempowerment.com/api/bnw/status/${msisdn}/${serviceId}`);
  const data = await upstream.json();
  res.json(data);
});

// Automatic check for real site visitors — reads MSISDN from the carrier-injected header
app.get('/api/check-status', async (req, res) => {
  const msisdn = req.headers['msisdn'];
  if (!msisdn) {
    return res.status(400).json({ error: 'MSISDN header missing — not coming through carrier gateway' });
  }
  const upstream = await fetch(`http://mobempowerment.com/api/bnw/status/${msisdn}/264`);
  const data = await upstream.json();
  res.json(data);
});

app.listen(3001, () => {
    console.log('Status proxy listening on port 3001');
});