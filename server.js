// GET: Fetch appointments ordered chronologically by Date & Time
app.get('/api/appointments', async (req, res) => {
  try {
    await ensureColumnsExist();

    // Check table column names to sort by the active date column
    const [cols] = await db.query(`SHOW COLUMNS FROM appointments`);
    const colNames = cols.map(c => c.Field);

    let dateCol = 'id'; // fallback
    if (colNames.includes('appointment_time')) {
      dateCol = 'appointment_time';
    } else if (colNames.includes('appointment_date')) {
      dateCol = 'appointment_date';
    } else if (colNames.includes('date_time')) {
      dateCol = 'date_time';
    }

    // Query sorted by date column in ASCENDING order (earliest dates first)
    const [rows] = await db.query(`SELECT * FROM appointments ORDER BY ${dateCol} ASC`);

    let usersMap = {};
    try {
      const [uRows] = await db.query(`SELECT * FROM users`);
      uRows.forEach(u => { usersMap[u.id] = u; });
    } catch (e) {}

    const standardized = rows.map(app => {
      const u = app.patient_id ? usersMap[app.patient_id] : null;

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