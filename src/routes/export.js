/**
 * src/routes/export.js — Spreadsheet Export (Excel & CSV) and Tailored Artifacts Delivery Routes
 *
 * Implements lightweight, non-overloaded Excel exports:
 *   - Tab 1: Applications Master (Core metrics, status, URLs, file pointers)
 *   - Tab 2: Resumes & Cover Letter Details (Explicit text + direct links to JSON, TXT & PDF)
 *
 * Endpoints:
 *   - GET /api/export/xlsx
 *   - GET /api/export/csv
 *   - GET /api/resume/download/:filename
 *   - GET /api/resume/cover-letter/:id
 *   - GET /api/resume/json/:id
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
    const rows = applied.map(a => {
      const cleanId = String(a.id || a.jobId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      return {
        'ID': a.id,
        'Applied Date': a.applied_at ? a.applied_at.slice(0, 10) : '',
        'Job Title': a.title,
        'Company': a.company,
        'Location': a.location,
        'Match Score': a.match_score,
        'ATS Fit %': a.ats_keyword_fit,
        'Status': a.status,
        'PDF Resume File': a.pdf_filename || '',
        'PDF Download Link': a.pdf_filename ? `${baseUrl}/api/resume/download/${encodeURIComponent(a.pdf_filename)}` : '',
        'Cover Letter Link': cleanId ? `${baseUrl}/api/resume/cover-letter/${encodeURIComponent(cleanId)}` : '',
        'Resume JSON Link': cleanId ? `${baseUrl}/api/resume/json/${encodeURIComponent(cleanId)}` : '',
        'Job Posting URL': a.job_url || '',
        'Source': a.source || 'Direct',
        'Artifacts Folder': cleanId ? `data/tailored/${cleanId}/` : '',
        'Notes': a.notes || ''
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Message': 'No applied jobs recorded yet' }]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Applications Master');

    // Tab 2: Resumes & Cover Letter Details (Explicit text + direct links to JSON, TXT & PDF)
    const letterRows = applied.map(a => {
      const cleanId = String(a.id || a.jobId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      return {
        'Job Title': a.title,
        'Company': a.company,
        'Tailored Executive Summary': (a.tailored_summary || '').trim(),
        'Full Cover Letter': (a.cover_letter || '').trim(),
        'Resume PDF File': a.pdf_filename || '',
        'PDF Download Link': a.pdf_filename ? `${baseUrl}/api/resume/download/${encodeURIComponent(a.pdf_filename)}` : '',
        'Cover Letter Link': cleanId ? `${baseUrl}/api/resume/cover-letter/${encodeURIComponent(cleanId)}` : '',
        'Resume JSON Link': cleanId ? `${baseUrl}/api/resume/json/${encodeURIComponent(cleanId)}` : '',
        'Artifacts Folder': cleanId ? `data/tailored/${cleanId}/` : ''
      };
    });
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
    const headers = ['ID', 'Applied Date', 'Job Title', 'Company', 'Location', 'Match Score', 'ATS Fit %', 'Job URL', 'Source', 'Status', 'Notes', 'PDF Resume', 'Artifacts Folder'];
    const escapeCsv = (val) => {
      const s = String(val == null ? '' : val).replace(/"/g, '""');
      return `"${s}"`;
    };

    let csvContent = headers.join(',') + '\n';
    for (const a of applied) {
      const cleanId = String(a.id || a.jobId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
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
        escapeCsv(a.pdf_filename),
        escapeCsv(cleanId ? `data/tailored/${cleanId}/` : '')
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
    let filePath = path.join(dataDir, filename);

    // If not directly in dataDir, check tailored subfolders
    if (!fs.existsSync(filePath)) {
      const tailoredDir = path.join(dataDir, 'tailored');
      if (fs.existsSync(tailoredDir)) {
        const subdirs = fs.readdirSync(tailoredDir);
        for (const sub of subdirs) {
          const cand = path.join(tailoredDir, sub, filename);
          if (fs.existsSync(cand)) {
            filePath = cand;
            break;
          }
        }
      }
    }

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

// GET /api/resume/cover-letter/:id
router.get('/cover-letter/:id', (req, res) => {
  try {
    const cleanId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const txtPath = path.join(dataDir, 'tailored', cleanId, 'cover_letter.txt');

    if (!fs.existsSync(txtPath)) {
      return res.status(404).json({ error: 'Cover letter text not found for this job' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${cleanId}_cover_letter.txt"`);
    fs.createReadStream(txtPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resume/json/:id
router.get('/json/:id', (req, res) => {
  try {
    const cleanId = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const jsonPath = path.join(dataDir, 'tailored', cleanId, 'resume.json');
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Structured resume JSON not found for this job' });
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    fs.createReadStream(jsonPath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
