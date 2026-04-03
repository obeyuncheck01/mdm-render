const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection - uses Render's environment variables
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to database successfully');
    }
});

// ============= API ENDPOINTS =============

// Register device
app.post('/api/register', (req, res) => {
    const { deviceId, name, model, androidVersion } = req.body;
    const sql = `INSERT INTO devices (id, name, model, android_version, last_seen) 
                 VALUES (?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE 
                 name=?, model=?, android_version=?, last_seen=NOW()`;
    db.query(sql, [deviceId, name, model, androidVersion, name, model, androidVersion], (err) => {
        if (err) {
            console.error('Register error:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Report device status
app.post('/api/status', (req, res) => {
    const { deviceId, battery, location } = req.body;
    const sql = `UPDATE devices SET battery=?, location=?, last_seen=NOW() WHERE id=?`;
    db.query(sql, [battery, location, deviceId], (err) => {
        if (err) {
            console.error('Status error:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Get pending commands for device
app.get('/api/commands/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    db.query(`SELECT id, command FROM commands WHERE device_id=? AND status='pending'`, [deviceId], (err, commands) => {
        if (err) {
            console.error('Commands error:', err);
            res.status(500).json({ error: err.message });
        } else {
            commands.forEach(cmd => {
                db.query(`UPDATE commands SET status='sent' WHERE id=?`, [cmd.id]);
            });
            res.json({ commands });
        }
    });
});

// Send command from admin panel
app.post('/api/send-command', (req, res) => {
    const { deviceId, command } = req.body;
    db.query(`INSERT INTO commands (device_id, command) VALUES (?, ?)`, [deviceId, command], (err) => {
        if (err) {
            console.error('Send command error:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// Mark device as paid
app.post('/api/mark-paid', (req, res) => {
    const { deviceId } = req.body;
    db.query(`UPDATE devices SET paid=TRUE WHERE id=?`, [deviceId], (err) => {
        if (err) {
            console.error('Mark paid error:', err);
            res.status(500).json({ error: err.message });
        } else {
            db.query(`INSERT INTO commands (device_id, command) VALUES (?, 'release_ownership')`, [deviceId]);
            res.json({ success: true });
        }
    });
});

// Get all devices
app.get('/api/devices', (req, res) => {
    db.query(`SELECT * FROM devices ORDER BY last_seen DESC`, (err, devices) => {
        if (err) {
            console.error('Get devices error:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ devices });
        }
    });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.query(`SELECT * FROM admin_users WHERE username=? AND password=?`, [username, password], (err, users) => {
        if (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: err.message });
        } else if (users.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
        } else {
            res.json({ success: true });
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('MDM Server is running. Go to /admin.html for admin panel.');
});

// Start server
app.listen(PORT, () => {
    console.log(`MDM Server running on port ${PORT}`);
});