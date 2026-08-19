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

// GET: Fetch all appointments
app.get('/api/appointments', async (req, res) => {
  try {
    const query = `SELECT * FROM appointments ORDER BY id DESC`;
    const [results] = await db.query(query);
    res.json(results);
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST: Create appointment
app.post('/api/appointments', async (req, res) => {
  try {
    const body = req.body;
    const clientVal = body.full_name || body.client_name || body.name || body.client || '';
    const counselorVal = body.counselor_name || body.counselor || body.doctor_name || body.doctor || '';
    const phoneVal = body.phone || body.phone_number || body.mobile || body.contact || '';
    const timeVal = body.appointment_time || body.appointment_date || body.date_time || body.date || '';
    const notesVal = body.notes || body.message || '';

    // Fetch column schema dynamically
    const [columns] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = columns.map(c => c.Field);

    let insertCols = [];
    let insertVals = [];
    let placeholders = [];

    // Automatically fill required integer ID columns with default 0
    colNames.forEach(col => {
      if (col.endsWith('_id') && col !== 'id') {
        insertCols.push(col);
        insertVals.push(0);
        placeholders.push('?');
      }
    });

    // Dynamic field matching for text and date attributes
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