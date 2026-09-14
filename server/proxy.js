// server/proxy.js — deployed as /var/www/gameluck.app/server/proxy.js
// Proxies subscription status checks to the mobempowerment.com upstream so the
// browser never calls it (and its host) directly.
const express = require('express');
const app = express();

app.get('/api/check-status/:msisdn/:serviceId', async (req, res) => {
    const { msisdn, serviceId } = req.params;
    try {
        const upstream = await fetch(`http://mobempowerment.com/api/bnw/status/${msisdn}/${serviceId}`);
        const data = await upstream.json();
        res.status(upstream.status).json(data);
    } catch (e) {
        console.error('Upstream status check failed', e);
        res.status(502).json({ error: 'Upstream status check failed' });
    }
});

app.listen(3001, () => {
    console.log('Status proxy listening on port 3001');
});
