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

// GET: Fetch appointments with JOIN fallback for user names
app.get('/api/appointments', async (req, res) => {
  try {
    // Check if users table exists to join patient details
    const [tables] = await db.query(`SHOW TABLES LIKE 'users'`);
    let query = `SELECT * FROM appointments ORDER BY id DESC`;

    if (tables.length > 0) {
      query = `
        SELECT 
          a.*, 
          u.name AS user_name, 
          u.phone AS user_phone,
          u.email AS user_email
        FROM appointments a
        LEFT JOIN users u ON a.patient_id = u.id
        ORDER BY a.id DESC
      `;
    }

    const [results] = await db.query(query);
    res.json(results);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Save appointment & update linked user profile
app.post('/api/appointments', async (req, res) => {
  try {
    const body = req.body;
    const clientVal = body.full_name || body.client_name || body.name || body.client || '';
    const counselorVal = body.counselor_name || body.counselor || body.doctor_name || body.doctor || '';
    const phoneVal = body.phone || body.phone_number || body.mobile || body.contact || '';
    const timeVal = body.appointment_time || body.appointment_date || body.date_time || body.date || '';
    const notesVal = body.notes || body.message || '';

    // Step 1: Insert or update user record to capture name & phone number
    let validUserId = 1;
    try {
      const [userInsert] = await db.query(
        `INSERT INTO users (name, phone) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone)`,
        [clientVal || 'Guest User', phoneVal || '']
      );
      validUserId = userInsert.insertId || userInsert.id || 1;
    } catch (uErr) {
      console.warn("Users table write note:", uErr.message);
      // Fallback: pick existing user ID
      const [uRows] = await db.query(`SELECT id FROM users LIMIT 1`);
      if (uRows.length > 0) validUserId = uRows[0].id;
    }

    // Step 2: Dynamically map appointment fields
    const [columns] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = columns.map(c => c.Field);

    let insertCols = [];
    let insertVals = [];
    let placeholders = [];

    // Map foreign key fields
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

    // Map direct text columns if present
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

// DELETE: Remove appointment by ID
app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const appointmentId = req.params.id;

    if (!appointmentId) {
      return res.status(400).json({ error: "Missing appointment ID" });
    }

    const query = `DELETE FROM appointments WHERE id = ?`;
    const [result] = await db.query(query, [appointmentId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    return res.status(200).json({ success: true, message: "Appointment deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});