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
    const full_name = body.full_name || body.client_name || body.name || body.client;
    const counselor_name = body.counselor_name || body.counselor || body.doctor_name || body.doctor;
    const phone = body.phone || body.phone_number || body.mobile || body.contact;
    const appointment_time = body.appointment_time || body.appointment_date || body.date_time || body.date;
    const notes = body.notes || body.message || '';

    if (!full_name) {
      return res.status(400).json({ error: "Client name is required" });
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