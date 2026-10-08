/**
 * src/routes/export.js — Spreadsheet Export (Excel & CSV) and PDF Download Routes
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jobsDb = require('../../scripts/core/jobs-db');
const { getDataDir } = require('../../scripts/core/common-utils');

const dataDir = getDataDir();

// GET /api/export/xlsx
router.get('/xlsx', (req, res) => {
  try {
    let XLSX;
    try { XLSX = require('xlsx'); } catch (_) {}
    if (!XLSX) return res.status(500).json({ error: 'XLSX package unavailable' });

    const applied = jobsDb.getAppliedJobs(1000);
    const wb = XLSX.utils.book_new();

    // Tab 1: Applied Jobs Master
    const rows = applied.map(a => ({
      'ID': a.id,
      'Applied Date': a.applied_at,
      'Job Title': a.title,
      'Company': a.company,
      'Location': a.location,
      'Match Score': a.match_score,
      'ATS Fit %': a.ats_keyword_fit,
      'Job URL': a.job_url,
      'Source': a.source,
      'Status': a.status,
      'Notes': a.notes || '',
      'PDF Resume': a.pdf_filename
    }));
    const ws1 = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Message': 'No applied jobs recorded yet' }]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Applications Master');

    // Tab 2: Cover Letters
    const letterRows = applied.map(a => ({
      'Role': a.title,
      'Company': a.company,
      'Cover Letter Draft': a.cover_letter,
      'Tailored Summary': a.tailored_summary
    }));
    const ws2 = XLSX.utils.json_to_sheet(letterRows.length ? letterRows : [{ 'Message': 'No letters recorded yet' }]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumes & Cover Letters');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Applied_Jobs_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/csv
router.get('/csv', (req, res) => {
  try {
    const applied = jobsDb.getAppliedJobs(1000);
    const headers = ['ID', 'Applied Date', 'Job Title', 'Company', 'Location', 'Match Score', 'ATS Fit %', 'Job URL', 'Source', 'Status', 'Notes', 'PDF Resume'];
    const escapeCsv = (val) => {
      const s = String(val == null ? '' : val).replace(/"/g, '""');
      return `"${s}"`;
    };

    let csvContent = headers.join(',') + '\n';
    for (const a of applied) {
      const row = [
        escapeCsv(a.id),
        escapeCsv(a.applied_at),
        escapeCsv(a.title),
        escapeCsv(a.company),
        escapeCsv(a.location),
        escapeCsv(a.match_score),
        escapeCsv(a.ats_keyword_fit),
        escapeCsv(a.job_url),
        escapeCsv(a.source),
        escapeCsv(a.status),
        escapeCsv(a.notes || ''),
        escapeCsv(a.pdf_filename)
      ];
      csvContent += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Applied_Jobs_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resume/download/:filename
router.get('/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
