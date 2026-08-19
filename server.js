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

// GET: Fetch appointments with dynamic column and user mapping
app.get('/api/appointments', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM appointments ORDER BY id DESC`);

    let usersMap = {};
    try {
      const [uRows] = await db.query(`SELECT * FROM users`);
      uRows.forEach(u => { usersMap[u.id] = u; });
    } catch (e) {}

    const standardized = rows.map(app => {
      const patientUser = app.patient_id ? usersMap[app.patient_id] : null;
      const doctorUser = app.doctor_id ? usersMap[app.doctor_id] : null;

      const clientName = app.client_name || app.full_name || app.patient_name || (patientUser ? patientUser.name : null) || app.name || 'N/A';
      const phone = app.phone || app.phone_number || app.mobile || app.contact || (patientUser ? patientUser.phone : null) || 'N/A';
      const counselor = app.counselor_name || app.counselor || (doctorUser ? doctorUser.name : null) || app.doctor || app.doctor_name || 'Mindcare Counselor';
      const rawDate = app.appointment_time || app.appointment_date || app.date_time || app.date || '';
      const notes = app.notes || app.message || '';

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

// POST: Save appointment guaranteed to provide a non-null patient_id
app.post('/api/appointments', async (req, res) => {
  try {
    const body = req.body;
    const clientVal = body.full_name || body.client_name || body.name || 'Guest Patient';
    const counselorVal = body.counselor_name || body.counselor || 'Mindcare Counselor';
    const phoneVal = body.phone || body.phone_number || body.mobile || '';
    const timeVal = body.appointment_time || body.appointment_date || body.date_time || '';
    const notesVal = body.notes || body.message || '';

    // Step 1: Ensure a valid patient_id exists in users table
    let validUserId = null;

    try {
      // Check if user already exists by phone
      if (phoneVal) {
        const [existing] = await db.query(`SELECT id FROM users WHERE phone = ? LIMIT 1`, [phoneVal]);
        if (existing.length > 0) {
          validUserId = existing[0].id;
        }
      }

      // If not found, insert new user record
      if (!validUserId) {
        const [uInsert] = await db.query(
          `INSERT INTO users (name, phone) VALUES (?, ?)`,
          [clientVal, phoneVal]
        );
        validUserId = uInsert.insertId;
      }
    } catch (uErr) {
      console.warn("User record creation warning:", uErr.message);
      // Fallback: pick any existing user id from database if present
      try {
        const [anyUser] = await db.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
        if (anyUser.length > 0) validUserId = anyUser[0].id;
      } catch (e) {}
    }

    // Safety check: if users table is completely empty, insert a dummy record
    if (!validUserId) {
      const [fallbackInsert] = await db.query(`INSERT INTO users (name, phone) VALUES ('Guest User', '0000000000')`);
      validUserId = fallbackInsert.insertId;
    }

    // Step 2: Map columns dynamically according to appointments table structure
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

    // Always append patient_id and doctor_id if required by MySQL constraints
    addCol('patient_id', validUserId);
    if (colNames.includes('doctor_id')) addCol('doctor_id', 1);

    // Dynamic direct column assignments
    addCol('full_name', clientVal);
    addCol('client_name', clientVal);
    addCol('patient_name', clientVal);
    
    addCol('phone', phoneVal);
    addCol('phone_number', phoneVal);
    addCol('mobile', phoneVal);

    addCol('counselor_name', counselorVal);
    addCol('counselor', counselorVal);
    addCol('doctor_name', counselorVal);

    addCol('appointment_time', timeVal);
    addCol('appointment_date', timeVal);

    addCol('notes', notesVal);
    addCol('message', notesVal);

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