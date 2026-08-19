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

// GET: Standardize returned keys so admin.html reads values instantly
app.get('/api/appointments', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM appointments ORDER BY id DESC`);
    
    // Check if a users table exists for name lookups
    let usersMap = {};
    try {
      const [uRows] = await db.query(`SELECT * FROM users`);
      uRows.forEach(u => { usersMap[u.id] = u; });
    } catch (e) {
      // Ignore if users table doesn't exist
    }

    const standardized = rows.map(app => {
      // Extract linked user if patient_id exists
      const linkedUser = app.patient_id ? usersMap[app.patient_id] : null;

      const clientName = app.client_name || app.patient_name || app.full_name || app.client || app.name || (linkedUser ? linkedUser.name : null) || 'N/A';
      const phone = app.phone || app.phone_number || app.mobile || app.contact || (linkedUser ? linkedUser.phone : null) || 'N/A';
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

// POST: Save appointment
app.post('/api/appointments', async (req, res) => {
  try {
    const body = req.body;
    const clientVal = body.full_name || body.client_name || body.name || body.client || '';
    const counselorVal = body.counselor_name || body.counselor || body.doctor_name || body.doctor || '';
    const phoneVal = body.phone || body.phone_number || body.mobile || body.contact || '';
    const timeVal = body.appointment_time || body.appointment_date || body.date_time || body.date || '';
    const notesVal = body.notes || body.message || '';

    // Step 1: Manage linked user
    let validUserId = 1;
    try {
      const [uInsert] = await db.query(
        `INSERT INTO users (name, phone) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone)`,
        [clientVal || 'Guest User', phoneVal || '']
      );
      validUserId = uInsert.insertId || 1;
    } catch (uErr) {
      const [uRows] = await db.query(`SELECT id FROM users LIMIT 1`);
      if (uRows.length > 0) validUserId = uRows[0].id;
    }

    // Step 2: Map columns dynamically
    const [columns] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = columns.map(c => c.Field);

    let insertCols = [];
    let insertVals = [];
    let placeholders = [];

    if (colNames.includes('patient_id')) {
      insertCols.push('patient_id');
      insertVals.push(validUserId);
      placeholders.push('?');
    }

    if (colNames.includes('doctor_id')) {
      insertCols.push('doctor_id');
      insertVals.push(1);
      placeholders.push('?');
    }

    let nameCol = colNames.find(c => ['client_name', 'patient_name', 'full_name', 'client', 'name'].includes(c) && !c.endsWith('_id'));
    let counselorCol = colNames.find(c => ['counselor_name', 'counselor', 'doctor_name', 'doctor'].includes(c) && !c.endsWith('_id'));
    let phoneCol = colNames.find(c => ['phone', 'phone_number', 'mobile', 'contact'].includes(c));
    let timeCol = colNames.find(c => ['appointment_date', 'appointment_time', 'date_time', 'date'].includes(c));
    let notesCol = colNames.find(c => ['notes', 'message', 'description'].includes(c));

    if (nameCol) { insertCols.push(nameCol); insertVals.push(clientVal); placeholders.push('?'); }
    if (counselorCol) { insertCols.push(counselorCol); insertVals.push(counselorVal); placeholders.push('?'); }
    if (phoneCol) { insertCols.push(phoneCol); insertVals.push(phoneVal); placeholders.push('?'); }
    if (timeCol) { insertCols.push(timeCol); insertVals.push(timeVal); placeholders.push('?'); }
    if (notesCol) { insertCols.push(notesCol); insertVals.push(notesVal); placeholders.push('?'); }

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