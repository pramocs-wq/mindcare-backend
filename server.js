const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Get appointments with Client Name, Counselor Name, Phone, Date & Notes
app.get('/api/appointments', async (req, res) => {
  try {
    const query = `
      SELECT 
        a.id, 
        client_user.full_name AS client_name, 
        client_user.phone_number,
        counselor_user.full_name AS counselor_name, 
        a.appointment_date, 
        a.notes
      FROM appointments a
      LEFT JOIN users client_user ON a.patient_id = client_user.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN users counselor_user ON d.user_id = counselor_user.id
    `;
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Book appointment
app.post('/api/appointments', async (req, res) => {
  const { name, counselor_name, phone_number, appointment_date, notes } = req.body;

  try {
    // Generate placeholder email to satisfy MySQL NOT NULL constraint
    const dummyEmail = `user_${Date.now()}@mindcare.local`;

    // 1. Find or create Client in users table
    let [clientRows] = await db.query('SELECT id FROM users WHERE full_name = ?', [name]);
    let patient_id;

    if (clientRows.length > 0) {
      patient_id = clientRows[0].id;
      // Optionally update phone number if column exists
      try {
        await db.query('UPDATE users SET phone_number = ? WHERE id = ?', [phone_number, patient_id]);
      } catch (err) { /* ignore if column missing */ }
    } else {
      // Try inserting with phone_number, fallback without if column isn't added yet
      try {
        const [newClient] = await db.query(
          'INSERT INTO users (full_name, email, phone_number) VALUES (?, ?, ?)', 
          [name, dummyEmail, phone_number]
        );
        patient_id = newClient.insertId;
      } catch (err) {
        const [newClient] = await db.query(
          'INSERT INTO users (full_name, email) VALUES (?, ?)', 
          [name, dummyEmail]
        );
        patient_id = newClient.insertId;
      }
    }

    // 2. Find or create Counselor
    const dummyCounselorEmail = `counselor_${Date.now()}@mindcare.local`;
    let [counselorUserRows] = await db.query('SELECT id FROM users WHERE full_name = ?', [counselor_name]);
    let counselor_user_id;

    if (counselorUserRows.length > 0) {
      counselor_user_id = counselorUserRows[0].id;
    } else {
      const [newCounselorUser] = await db.query(
        'INSERT INTO users (full_name, email) VALUES (?, ?)', 
        [counselor_name, dummyCounselorEmail]
      );
      counselor_user_id = newCounselorUser.insertId;
    }

    // Link in doctors table
    let [docRows] = await db.query('SELECT id FROM doctors WHERE user_id = ?', [counselor_user_id]);
    let doctor_id;

    if (docRows.length > 0) {
      doctor_id = docRows[0].id;
    } else {
      const [newDoc] = await db.query('INSERT INTO doctors (user_id) VALUES (?)', [counselor_user_id]);
      doctor_id = newDoc.insertId;
    }

    // 3. Save Appointment
    const [result] = await db.query(
      'INSERT INTO appointments (patient_id, doctor_id, appointment_date, notes) VALUES (?, ?, ?, ?)',
      [patient_id, doctor_id, appointment_date, notes]
    );

    res.status(201).json({ message: 'Appointment booked successfully', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));