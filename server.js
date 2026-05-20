require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SQLITE FILE-BASED DATABASE CONNECTION ──
// This automatically creates a file named 'database.sqlite' in your folder
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
        console.error('❌ Failed to open SQLite database:', err.message);
    } else {
        console.log('📦 Connected to the local SQLite database file.');
    }
});

// Create the bookings table automatically if it doesn't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            service TEXT,
            message TEXT,
            time_slot TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

// ── NODEMAILER SMTP TRANSPORTER (FREE GMAIL) ──
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendNotificationEmail(to, subject, htmlContent) {
    try {
        await transporter.sendMail({
            from: `"Aurex Labs System" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html: htmlContent
        });
    } catch (error) {
        console.error("Email delivery failed:", error);
    }
}

// ── API ENDPOINTS ──

// 1. Submit a Booking (From website)
app.post('/api/bookings', (req, res) => {
    const { name, email, service, message, timeSlot } = req.body;

    if (!name || !email || !timeSlot) {
        return res.status(400).json({ error: 'Name, email, and time slot are required.' });
    }

    const sql = 'INSERT INTO bookings (name, email, service, message, time_slot) VALUES (?, ?, ?, ?, ?)';
    const params = [name, email, service || 'General Consultation', message || '', timeSlot];

    db.run(sql, params, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Database Error' });
        }

        // Notify Agency Admin
        sendNotificationEmail(
            process.env.SMTP_USER,
            `🚨 New Lead Request: ${name}`,
            `<h3>New Strategy Session Booked!</h3>
             <p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Service:</strong> ${service}</p>
             <p><strong>Slot requested:</strong> ${timeSlot}</p>
             <p><strong>Message:</strong> ${message}</p>`
        );

        // Send Confirmation Receipt to Client
        sendNotificationEmail(
            email,
            `Your Aurex Labs Strategy Session`,
            `<h2>Hi ${name},</h2>
             <p>We've received your request for a strategy call on <strong>${timeSlot}</strong>.</p>
             <p>Our team will review this request and send a confirmation link shortly.</p>
             <br><p>Best regards,<br>Aurex Labs Team</p>`
        );

        res.status(201).json({ message: 'Booking requested successfully!', bookingId: this.lastID });
    });
});

// 2. Fetch All Bookings (For Dashboard UI)
app.get('/api/bookings', (req, res) => {
    db.all('SELECT * FROM bookings ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 3. Update Booking Status (Confirm/Cancel from Dashboard)
app.put('/api/bookings/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // Fetch client info first to get their email address
    db.get('SELECT * FROM bookings WHERE id = ?', [id], (err, booking) => {
        if (err || !booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        db.run('UPDATE bookings SET status = ? WHERE id = ?', [status, id], function (updateErr) {
            if (updateErr) {
                return res.status(500).json({ error: updateErr.message });
            }

            // Email Client updating them on the status change
            sendNotificationEmail(
                booking.email,
                `Update: Your Aurex Labs Meeting is ${status.toUpperCase()}`,
                `<h2>Hello ${booking.name},</h2>
                 <p>Your appointment status regarding the <strong>${booking.service}</strong> session has been updated to: <strong>${status.toUpperCase()}</strong>.</p>
                 ${status === 'confirmed' ? '<p>See you then! We will contact you shortly with video conference links.</p>' : '<p>If you wish to reschedule, feel free to visit our portal again.</p>'}
                 <br><p>In partnership,<br>Aurex Labs</p>`
            );

            res.json({ message: `Status updated cleanly to ${status}` });
        });
    });
});

// Run Application
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Aurex Engine firing safely on port ${PORT}`));