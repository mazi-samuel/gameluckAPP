const express = require('express');
const app = express();

const SERVICE_ID = process.env.SERVICE_ID || '264';
const STATUS_API = 'http://mobempowerment.com/api/bnw/status';
const UPSTREAM_TIMEOUT_MS = 8000;

// Nigerian mobile numbers in any common shape -> 234XXXXXXXXXX
function normalizeMsisdn(raw) {
  const match = String(raw || '').replace(/[\s()+-]/g, '').match(/^(?:234|0)?([789][01]\d{8})$/);
  return match ? '234' + match[1] : null;
}

async function lookupStatus(msisdn, serviceId, res) {
  try {
    const upstream = await fetch(`${STATUS_API}/${encodeURIComponent(msisdn)}/${encodeURIComponent(serviceId)}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
    const data = await upstream.json();
    res.set('Cache-Control', 'no-store').json(data);
  } catch (err) {
    console.error('Status lookup failed:', err.message);
    res.status(502).json({ error: 'Subscription status service unavailable' });
  }
}

// Manual/testing lookup — you supply the number in the URL
app.get('/api/check-status/:msisdn/:serviceId', (req, res) => {
  lookupStatus(req.params.msisdn, req.params.serviceId, res);
});

// Automatic check for real site visitors — reads MSISDN from the carrier-injected header
app.get('/api/check-status', (req, res) => {
  const raw = req.headers['msisdn'];
  if (!raw) {
    return res.status(400).json({ code: 'NO_MSISDN', error: 'MSISDN header missing — not coming through carrier gateway' });
  }
  // Status API expects 234XXXXXXXXXX; carriers may send +234 or 0-prefixed
  const msisdn = normalizeMsisdn(raw) || String(raw).replace(/\D/g, '');
  lookupStatus(msisdn, SERVICE_ID, res);
});

// Phone sign-in for visitors off mobile data (Wi-Fi, desktop) — number typed on the landing page
app.get('/api/check-phone/:msisdn', (req, res) => {
  const msisdn = normalizeMsisdn(req.params.msisdn);
  if (!msisdn) {
    return res.status(422).json({ code: 'INVALID_MSISDN', error: 'Not a valid Nigerian mobile number' });
  }
  lookupStatus(msisdn, SERVICE_ID, res);
});

app.listen(3001, () => {
    console.log('Status proxy listening on port 3001');
});
