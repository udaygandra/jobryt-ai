/**
 * src/routes/jobs.js — Job Management & Real-World Application Tracking Routes
 * Handles pending, applied, rejected jobs, tailoring, status lifecycles, and user notes.
 */

const express = require('express');
const router = express.Router();
const jobsDb = require('../../scripts/core/jobs-db');
const { tailorJobApplication } = require('../../scripts/engine/tailor-engine');
const { fetchLinkedInJobDetails } = require('../../scripts/engine/fetch-all-boards');
const { getMasterProfile } = require('./profile');

// GET /api/jobs/pending
router.get('/pending', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const jobs = jobsDb.getPendingJobs(limit);
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/applied
router.get('/applied', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    let jobs = jobsDb.getAppliedJobs(limit);
    if (req.query.status) {
      const filterStatus = req.query.status.toLowerCase();
      jobs = jobs.filter(j => (j.status || 'applied').toLowerCase() === filterStatus);
    }
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/rejected
router.get('/rejected', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const jobs = jobsDb.getRejectedJobs(limit);
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/apply (Tailor Resume, Generate PDF & Cover Letter)
router.post('/apply', async (req, res) => {
  try {
    const { jobId, job: passedJob, tone, initialStatus, commit = true } = req.body;
    let job = passedJob;
    if (!job && jobId) {
      job = jobsDb.findJobRecord(jobId);
    }
    if (!job) {
      return res.status(404).json({ error: `Job record not found for ID: ${jobId}` });
    }

    // Auto-enrich job description if truncated/stubbed
    const curDesc = job.description || job.snippet || '';
    if (curDesc.length < 250) {
      const u = job.job_url || job.redirect_url || job.url || '';
      const numMatch = u.match(/-([0-9]{5,})/i) || u.match(/\/([0-9]{5,})/i);
      if (numMatch && numMatch[1]) {
        try {
          const fullDesc = await fetchLinkedInJobDetails(numMatch[1]);
          if (fullDesc && fullDesc.length > 250) {
            job.description = fullDesc;
          }
        } catch (_) {}
      }
    }

    const profile = getMasterProfile();
    const shouldCommit = commit !== false;
    const result = await tailorJobApplication(job, profile, tone || 'Professional & Direct', { persist: shouldCommit });

    if (!shouldCommit) {
      if (result) {
        result.status = 'Tailored';
      }
      return res.json({ success: true, committed: false, appliedJob: result });
    }

    // Default initial status to 'Tailored' (Ready to Submit)
    const finalStatus = initialStatus || (result && result.status) || 'Tailored';
    if (result && result.id) {
      jobsDb.updateJobStatus(result.id, finalStatus);
      result.status = finalStatus;
    }

    res.json({ success: true, committed: true, appliedJob: result });
  } catch (err) {
    console.error('Apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/refresh-details (Fetch & save full JD if previously truncated)
router.post('/:id/refresh-details', async (req, res) => {
  try {
    const { id } = req.params;
    const job = jobsDb.findJobRecord(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const url = job.job_url || job.redirect_url || job.url || '';
    const numMatch = url.match(/-([0-9]{5,})/i) || url.match(/\/([0-9]{5,})/i);
    if (numMatch && numMatch[1]) {
      const fullDesc = await fetchLinkedInJobDetails(numMatch[1]);
      if (fullDesc && fullDesc.length > 200) {
        job.description = fullDesc;
        jobsDb.savePendingJob(job);
        return res.json({ success: true, description: fullDesc });
      }
    }
    res.json({ success: false, message: 'Could not retrieve full description' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/reject
router.post('/reject', (req, res) => {
  try {
    const { jobId, job: passedJob } = req.body;
    let job = passedJob;
    if (!job && jobId) {
      job = jobsDb.findJobRecord(jobId) || { id: jobId, title: 'Unknown', company: 'Unknown' };
    }
    if (job) {
      jobsDb.saveRejectedJob(job);
      jobsDb.removePendingJob(job.id || jobId);
    }
    res.json({ success: true, message: 'Job marked as rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id/status — LinkedIn/Indeed Style Application Lifecycle Tracker
// Statuses: 'Tailored', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Archived'
router.patch('/:id/status', (req, res) => {
  try {
    const jobId = req.params.id;
    const { status, notes } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: 'Status is required (e.g. Applied, Interviewing, Offer, Rejected)' });
    }

    const success = jobsDb.updateJobStatus(jobId, status, notes);
    if (!success) {
      return res.status(404).json({ error: `Could not update status for job ${jobId}` });
    }

    res.json({ success: true, id: jobId, status, notes, message: `Application status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/notes — Add or update recruiter/interview notes
router.post('/:id/notes', (req, res) => {
  try {
    const jobId = req.params.id;
    const { notes } = req.body || {};
    const success = jobsDb.updateJobNotes(jobId, notes);
    if (!success) {
      return res.status(404).json({ error: `Could not update notes for job ${jobId}` });
    }
    res.json({ success: true, id: jobId, notes, message: 'Application notes saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/submit-tailored — Explicit submit from Tailored Package modal
router.post('/:id/submit-tailored', async (req, res) => {
  try {
    const { id } = req.params;
    const { job: passedJob, tone } = req.body || {};
    let job = passedJob || jobsDb.findJobRecord(id);
    if (!job) {
      return res.status(404).json({ error: `Job record not found for ID: ${id}` });
    }

    let existingStatus = null;
    try {
      const db = jobsDb.getDb();
      const existingRow = db.prepare('SELECT status FROM applied_jobs WHERE id = ? OR job_id = ?').get(String(id), String(id));
      if (existingRow && existingRow.status) {
        existingStatus = existingRow.status;
      }
    } catch (_) {}

    const profile = getMasterProfile();
    const result = await tailorJobApplication(
      job,
      profile,
      tone || 'Professional & Direct',
      { persist: true }
    );

    const finalStatus = (existingStatus && existingStatus !== 'Tailored') ? existingStatus : 'Tailored';
    if (result && result.id) {
      jobsDb.updateJobStatus(result.id, finalStatus);
      result.status = finalStatus;
    }

    res.json({ success: true, appliedJob: result });
  } catch (err) {
    console.error('submit-tailored error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id — Remove from applied tracking
router.delete('/:id', (req, res) => {
  try {
    const jobId = req.params.id;
    const success = jobsDb.deleteAppliedJob(jobId);
    res.json({ success, id: jobId, message: 'Application removed from tracking' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
