const { createClient } = require('@supabase/supabase-base'); // Install via npm install @supabase/supabase-js
const nodemailer = require('nodemailer');

// Connect to your cloud Supabase database
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

export default async function handler(req, res) {
    // Enable CORS requests from your own site
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. CLIENT BOOKING SUBMISSION (POST)
    if (req.method === 'POST') {
        const { name, email, service, message, timeSlot } = req.body;
        
        const { data, error } = await supabase
            .from('bookings')
            .insert([{ name, email, service, message, time_slot: timeSlot }]);

        if (error) return res.status(500).json({ error: error.message });

        // Send confirmation emails
        try {
            await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: process.env.SMTP_USER,
                subject: `🚨 New Lead: ${name}`,
                html: `<p><strong>Name:</strong> ${name}</p><p><strong>Slot:</strong> ${timeSlot}</p>`
            });
        } catch (e) { console.error(e); }

        return res.status(201).json({ message: 'Success' });
    }

    // 2. DASHBOARD DATA FETCH (GET)
    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    // 3. DASHBOARD STATUS UPDATE (PUT)
    if (req.method === 'PUT') {
        const { id, status } = req.body;
        const { data, error } = await supabase
            .from('bookings')
            .update({ status })
            .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json({ message: 'Updated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
