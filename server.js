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

// GET: Return distinct client, phone, and counselor values
app.get('/api/appointments', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM appointments ORDER BY id DESC`);

    // Fetch user map if users table exists
    let usersMap = {};
    try {
      const [uRows] = await db.query(`SELECT * FROM users`);
      uRows.forEach(u => { usersMap[u.id] = u; });
    } catch (e) {}

    const standardized = rows.map(app => {
      // Find patient user record
      const patientUser = app.patient_id ? usersMap[app.patient_id] : null;
      const doctorUser = app.doctor_id ? usersMap[app.doctor_id] : null;

      // Prioritize explicit text columns first, then linked user table fallback
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

// POST: Save distinct user (client) and appointment fields
app.post('/api/appointments', async (req, res) => {
  try {
    const body = req.body;
    const clientVal = body.full_name || body.client_name || body.name || '';
    const counselorVal = body.counselor_name || body.counselor || '';
    const phoneVal = body.phone || body.phone_number || body.mobile || '';
    const timeVal = body.appointment_time || body.appointment_date || body.date_time || '';
    const notesVal = body.notes || body.message || '';

    // Step 1: Create/Update patient record in users table with actual client details
    let validUserId = null;
    try {
      if (clientVal) {
        const [uInsert] = await db.query(
          `INSERT INTO users (name, phone) VALUES (?, ?) ON DUPLICATE KEY UPDATE phone=VALUES(phone)`,
          [clientVal, phoneVal]
        );
        validUserId = uInsert.insertId;
      }
    } catch (uErr) {
      console.warn("User table insert warning:", uErr.message);
    }

    // Step 2: Get table structure to assign parameters dynamically
    const [columns] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = columns.map(c => c.Field);

    let insertCols = [];
    let insertVals = [];
    let placeholders = [];

    // Helper to push values safely
    const addCol = (col, val) => {
      if (colNames.includes(col)) {
        insertCols.push(col);
        insertVals.push(val);
        placeholders.push('?');
      }
    };

    if (validUserId) addCol('patient_id', validUserId);

    // Save direct text fields into matching database columns
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

    if (insertCols.length === 0) {
      return res.status(400).json({ error: "No matching database columns found" });
    }

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