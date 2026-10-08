/**
 * src/routes/jobs.js — Job Management & Real-World Application Tracking Routes
 * Handles pending, applied, rejected jobs, tailoring, status lifecycles, and user notes.
 */

const express = require('express');
const router = express.Router();
const jobsDb = require('../../scripts/core/jobs-db');
const { tailorJobApplication } = require('../../scripts/engine/tailor-engine');
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
    const { jobId, job: passedJob, tone, initialStatus } = req.body;
    let job = passedJob;
    if (!job && jobId) {
      job = jobsDb.findJobRecord(jobId);
    }
    if (!job) {
      return res.status(404).json({ error: `Job record not found for ID: ${jobId}` });
    }

    const profile = getMasterProfile();
    const result = await tailorJobApplication(job, profile, tone || 'Professional & Direct');
    
    // If an initial status was requested (e.g., 'Tailored' or 'Applied')
    if (initialStatus && result && result.id) {
      jobsDb.updateJobStatus(result.id, initialStatus);
      result.status = initialStatus;
    }

    res.json({ success: true, appliedJob: result });
  } catch (err) {
    console.error('Apply error:', err);
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
