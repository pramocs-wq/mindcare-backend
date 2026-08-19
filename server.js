const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

// Explicit CORS headers
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GET: Fetch all appointments
app.get('/api/appointments', (req, res) => {
  const query = `SELECT * FROM appointments ORDER BY id DESC`;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Fetch Error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// POST: Create appointment
app.post('/api/appointments', (req, res) => {
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

  db.query(query, [full_name, counselor_name, phone, appointment_time, notes], (err, result) => {
    if (err) {
      console.error("Database Insert Error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ message: "Appointment booked successfully!", id: result.insertId });
  });
});

// DELETE: Remove appointment by ID
app.delete('/api/appointments/:id', (req, res) => {
  const appointmentId = req.params.id;

  if (!appointmentId) {
    return res.status(400).json({ error: "Missing appointment ID" });
  }

  const query = `DELETE FROM appointments WHERE id = ?`;

  db.query(query, [appointmentId], (err, result) => {
    if (err) {
      console.error("Delete Error:", err);
      return res.status(500).json({ error: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    return res.status(200).json({ success: true, message: "Appointment deleted" });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});