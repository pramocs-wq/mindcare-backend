const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

// Explicit CORS setup
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
    const full_name = req.body.full_name || req.body.client_name || req.body.name;
    const counselor_name = req.body.counselor_name || req.body.counselor;
    const phone = req.body.phone || req.body.phone_number;
    const appointment_time = req.body.appointment_time || req.body.appointment_date || req.body.date_time || req.body.date;
    const notes = req.body.notes || '';

    if (!full_name) {
      return res.status(400).json({ error: "Column 'full_name' cannot be null" });
    }

    const query = `
      INSERT INTO appointments (full_name, counselor_name, phone, appointment_time, notes)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(query, [full_name, counselor_name, phone, appointment_time, notes]);
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