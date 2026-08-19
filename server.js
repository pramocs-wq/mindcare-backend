const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to auto-create missing columns in MySQL table
async function ensureColumnsExist() {
  try {
    const [cols] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('client_name')) {
      await db.query(`ALTER TABLE appointments ADD COLUMN client_name VARCHAR(255) NULL`);
    }
    if (!colNames.includes('phone')) {
      await db.query(`ALTER TABLE appointments ADD COLUMN phone VARCHAR(50) NULL`);
    }
    if (!colNames.includes('counselor_name')) {
      await db.query(`ALTER TABLE appointments ADD COLUMN counselor_name VARCHAR(255) NULL`);
    }
  } catch (err) {
    console.warn("Column check/alter warning:", err.message);
  }
}

// GET: Fetch appointments with clear fallback hierarchy
app.get('/api/appointments', async (req, res) => {
  try {
    await ensureColumnsExist();

    const [rows] = await db.query(`SELECT * FROM appointments ORDER BY id DESC`);

    let usersMap = {};
    try {
      const [uRows] = await db.query(`SELECT * FROM users`);
      uRows.forEach(u => { usersMap[u.id] = u; });
    } catch (e) {}

    const standardized = rows.map(app => {
      const u = app.patient_id ? usersMap[app.patient_id] : null;

      // Direct text column -> user lookup -> fallback
      const clientName = app.client_name || app.full_name || app.patient_name || app.name || (u ? u.name || u.full_name || u.username : null) || 'N/A';
      const phone = app.phone || app.phone_number || app.mobile || app.contact || (u ? u.phone || u.mobile : null) || 'N/A';
      const counselor = app.counselor_name || app.counselor || app.doctor_name || app.doctor || 'N/A';
      const rawDate = app.appointment_time || app.appointment_date || app.date_time || app.date || '';
      const notes = app.notes || app.message || app.description || '';

      return {
        id: app.id,
        client_name: clientName,
        phone: phone,
        counselor_name: counselor,
        appointment_time: rawDate,
        notes: notes
      };
    });

    res.json(standardized);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Save appointment into guaranteed text columns
app.post('/api/appointments', async (req, res) => {
  try {
    await ensureColumnsExist();

    const body = req.body;
    const clientVal = body.full_name || body.client_name || body.name || 'Guest Patient';
    const counselorVal = body.counselor_name || body.counselor || 'Mindcare Counselor';
    const phoneVal = body.phone || body.phone_number || body.mobile || '';
    const timeVal = body.appointment_time || body.appointment_date || body.date_time || '';
    const notesVal = body.notes || body.message || '';

    // Create/link patient ID for database integrity
    let validUserId = 1;
    try {
      const [existing] = await db.query(`SELECT id FROM users WHERE phone = ? LIMIT 1`, [phoneVal]);
      if (existing.length > 0) {
        validUserId = existing[0].id;
      } else {
        const [uInsert] = await db.query(`INSERT INTO users (name, phone) VALUES (?, ?)`, [clientVal, phoneVal]);
        validUserId = uInsert.insertId;
      }
    } catch (uErr) {
      try {
        const [anyUser] = await db.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
        if (anyUser.length > 0) validUserId = anyUser[0].id;
      } catch (e) {}
    }

    const [columns] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = columns.map(c => c.Field);

    let insertCols = [];
    let insertVals = [];
    let placeholders = [];

    const addCol = (col, val) => {
      if (colNames.includes(col)) {
        insertCols.push(col);
        insertVals.push(val);
        placeholders.push('?');
      }
    };

    if (colNames.includes('patient_id')) addCol('patient_id', validUserId);
    if (colNames.includes('doctor_id')) addCol('doctor_id', 1);

    // Populate explicit text columns
    addCol('client_name', clientVal);
    addCol('full_name', clientVal);
    addCol('patient_name', clientVal);

    addCol('phone', phoneVal);
    addCol('phone_number', phoneVal);

    addCol('counselor_name', counselorVal);
    addCol('counselor', counselorVal);

    addCol('appointment_time', timeVal);
    addCol('appointment_date', timeVal);

    addCol('notes', notesVal);

    const query = `INSERT INTO appointments (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const [result] = await db.query(query, insertVals);

    res.status(201).json({ message: "Appointment booked successfully!", id: result.insertId });
  } catch (err) {
    console.error("Database Insert Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Remove appointment
app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const appointmentId = req.params.id;
    if (!appointmentId) return res.status(400).json({ error: "Missing appointment ID" });

    const [result] = await db.query(`DELETE FROM appointments WHERE id = ?`, [appointmentId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Appointment not found" });

    return res.status(200).json({ success: true, message: "Appointment deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));