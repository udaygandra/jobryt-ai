/**
 * tests/test-pdf-resume-parsing.js
 *
 * Generates test PDF resumes (including Sahana Rao D's exact resume and a Cloud Architect resume)
 * using PDFKit, uploads them to the /api/profile/upload-resume endpoint, verifies that all
 * fields are parsed cleanly into the master profile structure, and tests that all downstream
 * features (scoring, tailoring, PDF generation, application tracking) work flawlessly.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const PDFDocument = require('pdfkit');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const fixturesDir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });

function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, BASE_URL);
    const reqHeaders = { ...headers };
    let reqBody = null;

    if (body) {
      if (typeof body === 'object' && !(body instanceof Buffer)) {
        reqBody = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
      } else {
        reqBody = body;
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(reqBody);
    }

    const req = http.request(url, { method, headers: reqHeaders, timeout: 60000 }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json,
          buffer
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out: ${method} ${pathUrl}`));
    });

    if (reqBody) req.write(reqBody);
    req.end();
  });
}

// ── 1. Helper to generate binary PDF files ───────────────────────────────────
function createPdfFromLines(filePath, lines) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    for (const line of lines) {
      if (line === '--- PAGE BREAK ---') {
        doc.addPage();
      } else if (line.startsWith('# ')) {
        doc.fontSize(16).text(line.replace('# ', ''), { bold: true });
        doc.moveDown(0.2);
      } else if (line.startsWith('## ')) {
        doc.moveDown(0.4);
        doc.fontSize(12).text(line.replace('## ', ''), { underline: true });
        doc.moveDown(0.2);
      } else if (line.startsWith('• ') || line.startsWith('- ')) {
        doc.fontSize(9.5).text(line, { indent: 15 });
        doc.moveDown(0.1);
      } else {
        doc.fontSize(10).text(line);
        doc.moveDown(0.15);
      }
    }

    doc.end();
    stream.on('finish', () => resolve(fs.readFileSync(filePath)));
    stream.on('error', reject);
  });
}

async function runPdfTests() {
  console.log('='.repeat(70));
  console.log('📄 TESTING RESUME PDF PARSING & DOWNSTREAM FEATURES');
  console.log('='.repeat(70) + '\n');

  // ── FIXTURE 1: Sahana Rao D Resume (Exact uploaded resume content) ─────────
  const sahanaPdfPath = path.join(fixturesDir, 'sahana_rao_d_resume.pdf');
  const sahanaLines = [
    '# SAHANA RAO D',
    'Data Analyst',
    'Toronto, ON, Canada | donthineni1999@gmail.com | +1 (647) 969-3799 | Permanent Resident of Canada',
    '## PROFESSIONAL SUMMARY:',
    'Data Analyst with around 5 years of experience in data analysis, SQL, Power BI, Python, and Excel, delivering end-to-end analytics solutions across energy trading, banking, and healthcare. Skilled in data profiling, cleaning, and transformation using SQL and Python/Pandas, building and validating AI-ready datasets to support ML model training and retraining; and building interactive Power BI dashboards used by business stakeholders. Experienced with data warehousing, ETL/ELT pipelines (SQL Server, BigQuery), and cloud platforms (GCP, with working familiarity in Snowflake and Azure), alongside strong data validation, reconciliation, and stakeholder communication skills.',
    '## TECHNICAL SKILLS:',
    'SQL & Querying: SQL, T-SQL, Complex Joins (INNER/LEFT/FULL), CTEs, Window Functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, PARTITION BY), Subqueries, Stored Procedures, Views, Query Optimization, Data Profiling',
    'BI & Visualization: Power BI, DAX, Power Query, KPI Cards, Slicers, Drill-downs, Row-Level Security, Interactive Dashboards, Data Visualization, Power BI Service, Scheduled Refresh, Dashboard Sharing & Subscriptions, Performance Optimization (Performance Analyzer)',
    'Programming: Python, Pandas, NumPy, Matplotlib, Seaborn, Statistical Analysis, EDA, Time-Series Analysis, Feature Engineering',
    'Excel & Reporting: Advanced Excel, Pivot Tables, Power Query, XLOOKUP, INDEX-MATCH, SUMIFS, COUNTIFS, Conditional Formatting, VBA (basic)',
    'Data Management: Data Modeling, Star Schema, Dimensional Modeling, ETL/ELT, Data Warehousing, Data Cleaning, Data Validation, Data Reconciliation, Data Quality, Data Dictionary, AI-Ready Dataset Preparation',
    'Databases & Cloud: Microsoft SQL Server, PostgreSQL, Google BigQuery, Snowflake (Familiar), Azure Data Factory (Familiar), AWS (Familiar)',
    'Tools & Workflow: Git / GitHub, Jira, Confluence, Agile / Scrum, Power Automate, Microsoft Office Suite',
    '## PROFESSIONAL EXPERIENCE:',
    'Data Analyst II — Power Trading & Market Analytics',
    'Wipro – Toronto, Canada',
    'Sep 2025 – Present',
    '• Analyzed 112,000+ 15-minute interval electricity market records — Market Clearing Price (MCP), purchase/sell bids, scheduled demand, trading periods, and weather variables across 9 power-generation hub locations and 5 major demand-center cities — to identify pricing trends, demand patterns, and market behavior across peak and off-peak periods.',
    '• Wrote complex SQL queries using CTEs, window functions (LAG, ROW_NUMBER, PARTITION BY), and multi-table joins to extract, filter, aggregate, and validate market data from multiple source tables, reducing manual data preparation time by approximately 8 hours per week.',
    '• Performed end-to-end data profiling, cleaning, and validation — detecting and resolving missing values, duplicate timestamps, data type inconsistencies, and chronological errors across 112K+ records before analysis or reporting began.',
    '• Designed a star schema separating market fact data from a location-based weather dimension table, improving model maintainability and Power BI dashboard performance.',
    '• Conducted exploratory data analysis using Python (Pandas, Matplotlib, Seaborn) — examining price distributions, seasonality, peak/off-peak behavior, and weekday vs. weekend differences; identified that solar generation hours were associated with 20–30% midday price dips.',
    '• Performed comparative and driver analysis to quantify relationships between electricity prices, demand levels, trading periods, and weather variables; delivered structured findings to trading and operations stakeholders.',
    '--- PAGE BREAK ---',
    '• Defined and tracked 6 business KPIs — Average MCP, Peak-Period MCP, Price Variation Index, Scheduled Demand, Demand Category Distribution, and Bid Gap Ratio — to support procurement planning and risk monitoring.',
    '• Engineered time-based analytical features — peak-hour flags, weekday/weekend indicators, demand categories, lag variables, and 7-day rolling averages — to support time-series analysis of market behavior and downstream forecasting work targeting a sub-10% MAPE accuracy benchmark.',
    '• Developed 3 interactive Power BI dashboards using Power Query, DAX measures, KPI cards, slicers, and comparative visualizations, used daily by trading teams to monitor market conditions and support procurement timing decisions.',
    '• Used Power Automate to trigger email notifications to trading stakeholders when scheduled Power BI dataset refreshes completed, ensuring the team always worked from current data each morning.',
    '• Created reusable DAX measures and performed data reconciliation between SQL outputs and Power BI reports to ensure consistent KPI figures across all dashboards.',
    'Data Analyst — Fraud Analytics & Risk Scoring',
    'Wipro',
    'Jan 2024 – Aug 2025',
    '• Served as the Data Analyst on Fraud Analytics, a real-time fraud risk-scoring platform for a bank, partnering with Data Scientists and Developers to validate data quality from event ingestion through AML-facing reporting.',
    '• Profiled login and transaction event logs streamed via GCP Pub/Sub, documenting message structure, volume, and key risk fields to support model training and validation.',
    '• Monitored Pub/Sub subscriber health — lag, schema drift, duplicate and dropped messages — using SQL detection queries before issues could bias downstream risk scores.',
    '• Wrote BigQuery/SQL data-quality checks (duplicate event detection, null/out-of-range score audits, threshold-breach reconciliation) as part of a recurring curation review cycle.',
    '• Queried curated risk-score tables in BigQuery, joining flagged users back to source topic, threshold rule, and raw event to support AML case investigations.',
    '• Partnered with Data Scientists to tune per-topic threshold values, running false-positive-rate and threshold-sensitivity analysis in Python/Pandas to inform cutoff decisions.',
    '• Performed exploratory data analysis on historical fraud data used for model retraining, comparing masked datasets against production patterns to flag coverage or quality gaps.',
    '• Validated masked-data statistical integrity in JupyterHub ahead of retraining, confirming de-identification preserved the distributions needed for accurate model training — a core part of preparing AI-ready datasets for the platform’s ML layer.',
    '• Built DAX measures for the AML-facing Power BI dashboard — flagged-user trend, average risk score by topic, threshold-breach ratio, and case-aging — with row-level security scoping analysts to their assigned queue.',
    '• Documented threshold logic, topic-to-score mappings, and data dictionaries, improving handoff consistency across Data Science, Development, and AML stakeholders.',
    'Data Analyst — Healthcare Data Analytics',
    'Wipro',
    'Oct 2021 – Dec 2023',
    '• Partnered with a fertility clinic in India on a sperm-quality classification initiative, analyzing structured data on morphology, motility, and viability to characterize class distributions and quality trends for clinical stakeholders.',
    '• Quantified the cost of the existing manual microscope-based grading process — approximately 30–90 minutes per sample — and documented variation between observers and labs as part of the baseline case for a data-driven approach.',
    '• Performed exploratory data analysis using Python (Pandas, Matplotlib, Seaborn) to examine quality-score distributions, detect outliers, and validate dataset integrity ahead of downstream classification work.',
    '• Investigated class imbalance and inconsistent labeling across morphology, motility, and viability categories, documenting findings and recommending corrective actions.',
    '• Aligned analysis and reporting with the project’s dual objective of maximizing diagnostic accuracy while minimizing turnaround time, tracking progress against classification benchmarks spanning precision, recall, and F1 across all three tasks.',
    '• Built Power BI visualizations presenting sperm quality distributions, morphology metrics, and motility patterns for healthcare stakeholders, translating technical findings into non-technical reports.',
    '• Maintained data documentation and a data dictionary throughout the project to ensure reproducibility and support knowledge transfer across the project team.',
    '• Contributed analysis supporting the clinic’s economic case for automation, framed around reducing manual review effort and failed-cycle costs.',
    '--- PAGE BREAK ---',
    '## CERTIFICATIONS:',
    '• Microsoft Power BI Data Analyst (PL-300) — In Progress',
    '## EDUCATION:',
    '• Bachelor of Technology(B.Tech) Jun 2017 – Jul 2021',
    'Kakatiya Institute of Technology & Science (Kakatiya University), Warangal, India.'
  ];

  console.log('1. Generating binary PDF fixture for Sahana Rao D...');
  const sahanaPdfBuf = await createPdfFromLines(sahanaPdfPath, sahanaLines);
  assert(sahanaPdfBuf.length > 1000, 'PDF buffer must be non-empty');
  console.log(`   ✔ Generated ${sahanaPdfPath} (${sahanaPdfBuf.length} bytes)`);

  // ── TEST 1: Upload and Parse Sahana's PDF ──────────────────────────────────
  console.log('\n2. Testing /api/profile/upload-resume with Sahana Rao D PDF...');
  const uploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'sahana_rao_d_resume.pdf',
    fileBase64: sahanaPdfBuf.toString('base64')
  });

  assert.strictEqual(uploadRes.status, 200, `Upload must succeed with HTTP 200. Got: ${uploadRes.status} ${uploadRes.text}`);
  assert.strictEqual(uploadRes.json.success, true);
  const prof = uploadRes.json.profile;
  assert(prof, 'Profile object must be returned');

  console.log('   Verifying parsed fields for Sahana Rao D:');
  // Name
  assert.strictEqual(prof.name, 'SAHANA RAO D', 'Name must match SAHANA RAO D');
  console.log(`   ✔ Name: "${prof.name}"`);

  // Target roles
  assert(Array.isArray(prof.target_titles) && prof.target_titles.length > 0, 'Target titles must be populated');
  assert(prof.target_titles.includes('Data Analyst'), 'Target titles must include Data Analyst');
  console.log(`   ✔ Target Titles: [${prof.target_titles.join(', ')}]`);

  // Contact
  assert.strictEqual(prof.contact.email, 'donthineni1999@gmail.com', 'Email must match');
  assert.strictEqual(prof.contact.phone, '+1 (647) 969-3799', 'Phone must match');
  assert(prof.contact.location.includes('Toronto'), 'Location must include Toronto');
  assert.strictEqual(prof.contact.status, 'Permanent Resident of Canada', 'Residency status must be preserved');
  console.log(`   ✔ Contact: ${prof.contact.email} | ${prof.contact.phone} | ${prof.contact.location} | ${prof.contact.status}`);

  // Summary & Experience Years
  assert(prof.summary.includes('Data Analyst with around 5 years'), 'Summary must contain verbatim text');
  assert.strictEqual(prof.years_of_experience, 5, 'Experience years must be 5');
  console.log(`   ✔ Summary verified (~${prof.years_of_experience} years stated)`);

  // Skills
  assert(prof.skills.length >= 30, `Must extract granular skills (got ${prof.skills.length})`);
  assert(prof.skills.includes('Power BI'), 'Must include Power BI');
  assert(prof.skills.includes('SQL'), 'Must include SQL');
  assert(prof.skills.includes('Python'), 'Must include Python');
  assert(prof.skills.includes('Pandas'), 'Must include Pandas');
  assert(prof.skills.includes('DAX'), 'Must include DAX');
  assert(prof.skills.includes('Google BigQuery') || prof.skills.includes('BigQuery'), 'Must include BigQuery');
  assert(!prof.skills.includes('INNER') && !prof.skills.includes('LEFT') && !prof.skills.includes('FULL'), 'Must not contain SQL join keywords as skills');
  assert(!prof.skills.includes('Data') && !prof.skills.includes('Profiling'), 'Must not split Data Profiling into isolated words');
  assert(prof.skills.includes('Data Profiling'), 'Must contain Data Profiling intact');
  assert(prof.skills.includes('Feature Engineering'), 'Must contain Feature Engineering intact');
  assert(prof.skills.includes('Window Functions'), 'Must contain Window Functions intact');
  assert(prof.skills_familiar.includes('Snowflake'), 'Must identify Snowflake as familiar');
  console.log(`   ✔ Skills: Extracted ${prof.skills.length} granular skills without noise`);

  // Skills Categorized
  assert(Array.isArray(prof.skills_categorized) && prof.skills_categorized.length >= 4, 'Must have skill categories');
  console.log(`   ✔ Skill Categories (${prof.skills_categorized.length}): ${prof.skills_categorized.map(c => c.category).join(', ')}`);

  // Experience
  assert.strictEqual(prof.experience.length, 3, `Must extract exactly 3 roles (got ${prof.experience.length})`);
  const [role1, role2, role3] = prof.experience;

  // Role 1
  assert.strictEqual(role1.role, 'Data Analyst II');
  assert.strictEqual(role1.company, 'Wipro');
  assert(role1.dates.includes('Sep 2025') && role1.dates.includes('Present'));
  assert.strictEqual(role1.start_date, 'Sep 2025');
  assert.strictEqual(role1.end_date, 'Present');
  assert(role1.bullets.length >= 8, `Role 1 bullets across page break must be preserved (got ${role1.bullets.length})`);
  assert(!role1.bullets[role1.bullets.length - 1].includes('Fraud Analytics'), 'Last bullet of Role 1 must NOT bleed into next role');
  console.log(`   ✔ Role 1: ${role1.role} @ ${role1.company} (${role1.dates}) - ${role1.bullets.length} bullets`);

  // Role 2
  assert.strictEqual(role2.role, 'Data Analyst');
  assert.strictEqual(role2.company, 'Wipro');
  assert(role2.dates.includes('Jan 2024') && role2.dates.includes('Aug 2025'));
  assert(role2.bullets.length >= 8, `Role 2 bullets must be preserved (got ${role2.bullets.length})`);
  assert(!role2.bullets[role2.bullets.length - 1].includes('Healthcare Data Analytics'), 'Last bullet of Role 2 must NOT bleed into next role');
  console.log(`   ✔ Role 2: ${role2.role} @ ${role2.company} (${role2.dates}) - ${role2.bullets.length} bullets`);

  // Role 3
  assert.strictEqual(role3.role, 'Data Analyst');
  assert.strictEqual(role3.company, 'Wipro');
  assert(role3.dates.includes('Oct 2021') && role3.dates.includes('Dec 2023'));
  assert(role3.bullets.length >= 6, `Role 3 bullets must be preserved (got ${role3.bullets.length})`);
  console.log(`   ✔ Role 3: ${role3.role} @ ${role3.company} (${role3.dates}) - ${role3.bullets.length} bullets`);

  // Education
  assert(prof.education.length >= 1, 'Must extract education');
  const edu = prof.education[0];
  assert(edu.degree.includes('Bachelor of Technology') || edu.degree.includes('B.Tech'));
  assert(edu.institution.includes('Kakatiya Institute of Technology'));
  assert(edu.dates.includes('2017') && edu.dates.includes('2021'));
  console.log(`   ✔ Education: ${edu.degree} @ ${edu.institution} (${edu.dates})`);

  // Certifications
  assert(prof.certifications.length >= 1, 'Must extract certifications');
  const cert = prof.certifications[0];
  assert(cert.name.includes('Power BI Data Analyst') || cert.name.includes('PL-300'));
  assert.strictEqual(cert.issuer, 'Microsoft');
  assert.strictEqual(cert.date, 'In Progress');
  console.log(`   ✔ Certification: ${cert.name} [Issuer: ${cert.issuer}] (${cert.date})`);

  // ── TEST 2: Commit Sahana Profile to Master Store ──────────────────────────
  console.log('\n3. Testing POST /api/profile committing Sahana Rao D to Master Profile...');
  const saveRes = await request('POST', '/api/profile', prof);
  assert.strictEqual(saveRes.status, 200);
  assert.strictEqual(saveRes.json.success, true);

  const getProfileRes = await request('GET', '/api/profile');
  assert.strictEqual(getProfileRes.json.name, 'SAHANA RAO D');
  console.log('   ✔ Master Profile updated and verified in database');

  // ── TEST 3: Verify Downstream Features for Sahana Rao D ───────────────────
  console.log('\n4. Testing Downstream Features for Sahana Rao D:');

  // Downstream 1: Custom Job Evaluator
  console.log('   a) Evaluating Power BI & SQL Data Analyst job posting...');
  const evalRes = await request('POST', '/api/pipeline/evaluate-custom', {
    title: 'Senior Power BI & SQL Data Analyst',
    company: 'Capital Energy Markets',
    location: 'Toronto, ON (Hybrid)',
    description: 'Looking for a Data Analyst with 4+ years experience in SQL, Power BI dashboards, DAX measures, data profiling, and star schema modeling for energy and trading datasets.'
  });
  assert.strictEqual(evalRes.status, 200);
  assert(evalRes.json.evaluatedJob);
  const evalScore = evalRes.json.evaluatedJob.score;
  assert(evalScore >= 75, `Sahana Rao D must score strongly for matching Data Analyst role. Got: ${evalScore}`);
  console.log(`      ✔ Evaluation Score: ${evalScore}/100 Match`);

  // Downstream 2: ATS Tailoring Engine & PDF Resume Generation
  console.log('   b) Generating Tailored ATS PDF Resume & Cover Letter...');
  const applyRes = await request('POST', '/api/jobs/apply', {
    job: evalRes.json.evaluatedJob,
    tone: 'Professional & Direct'
  });
  assert.strictEqual(applyRes.status, 200);
  assert.strictEqual(applyRes.json.success, true);
  const appliedJob = applyRes.json.appliedJob;
  assert(appliedJob.pdf_filename, 'PDF resume filename must be created');
  assert(appliedJob.cover_letter.includes('Sahana') || appliedJob.cover_letter.includes('Data Analyst'), 'Cover letter must align with candidate');
  console.log(`      ✔ Generated Tailored PDF: ${appliedJob.pdf_filename}`);
  console.log(`      ✔ Cover Letter Word Count: ${appliedJob.cover_letter.split(/\s+/).length} words`);

  // Downstream 3: PDF Binary Stream Verification
  console.log('   c) Downloading and validating tailored PDF binary stream...');
  const dlRes = await request('GET', `/api/resume/download/${encodeURIComponent(appliedJob.pdf_filename)}`);
  assert.strictEqual(dlRes.status, 200);
  assert.strictEqual(dlRes.headers['content-type'], 'application/pdf');
  assert(dlRes.buffer.slice(0, 4).toString('ascii').startsWith('%PDF'), 'Must be valid PDF');
  console.log(`      ✔ Verified binary PDF download (${dlRes.buffer.length} bytes)`);

  // Downstream 4: Recruiter Intelligence for Target Employer
  console.log('   d) Generating Recruiter Intelligence for target employer...');
  const recRes = await request('GET', '/api/recruiters/search?company=Capital%20Energy%20Markets&city=Toronto');
  assert.strictEqual(recRes.status, 200);
  assert(recRes.json.draftLinkedInNote.includes('Data Analyst'), 'Recruiter note must reference candidate title');
  console.log(`      ✔ Generated X-Ray Search & LinkedIn connection note`);

  // Downstream 5: Excel and CSV Exports
  console.log('   e) Validating Excel (.xlsx) and CSV exports with newly applied job...');
  const xlsxRes = await request('GET', '/api/export/xlsx');
  assert.strictEqual(xlsxRes.status, 200);
  assert(xlsxRes.buffer.length > 500);

  const csvRes = await request('GET', '/api/export/csv');
  assert.strictEqual(csvRes.status, 200);
  assert(csvRes.text.includes('Senior Power BI & SQL Data Analyst'), 'CSV must include newly applied job');
  console.log(`      ✔ Verified XLSX & CSV exports with application record`);

  // ── FIXTURE 2: Cloud Architect Resume Test ────────────────────────────────
  console.log('\n5. Testing Second Test PDF (Cloud Systems Architect)...');
  const cloudPdfPath = path.join(fixturesDir, 'cloud_architect_resume.pdf');
  const cloudLines = [
    '# JORDAN REID',
    'Staff Cloud Infrastructure Architect',
    'Austin, TX | jordan.reid@cloudarch.io | +1 (512) 555-0144',
    '## SUMMARY:',
    'Staff Cloud Solutions Architect with 10+ years designing enterprise distributed systems on AWS and Kubernetes.',
    '## TECHNICAL SKILLS:',
    'Cloud Platforms: AWS, Google Cloud, Azure',
    'DevOps & Containers: Kubernetes, Docker, Terraform, Helm, CI/CD',
    'Languages: Go, Python, TypeScript, Bash',
    'Databases: PostgreSQL, DynamoDB, Redis',
    '## WORK EXPERIENCE:',
    'Staff Infrastructure Architect',
    'Vanguard Cloud Corp – Austin, TX',
    '2021 – Present',
    '• Architected multi-region Kubernetes clusters supporting 50M daily transactions with 99.999% uptime.',
    '• Reduced cloud infrastructure spend by $420,000 annually through automated autoscaling policies.',
    'Senior DevOps Engineer',
    'Stratum Networks',
    '2018 – 2021',
    '• Automated immutable infrastructure deployments using Terraform and GitHub Actions.',
    '## EDUCATION:',
    'B.S. Electrical & Computer Engineering',
    'University of Texas at Austin',
    '2014 – 2018',
    '## CERTIFICATIONS:',
    'AWS Certified Solutions Architect - Professional — 2022'
  ];

  const cloudPdfBuf = await createPdfFromLines(cloudPdfPath, cloudLines);
  const cloudUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'cloud_architect_resume.pdf',
    fileBase64: cloudPdfBuf.toString('base64')
  });

  assert.strictEqual(cloudUploadRes.status, 200);
  const cloudProf = cloudUploadRes.json.profile;
  assert.strictEqual(cloudProf.name, 'JORDAN REID');
  assert(cloudProf.target_titles.includes('Staff Cloud Infrastructure Architect') || cloudProf.target_titles.includes('Staff Infrastructure Architect'));
  assert.strictEqual(cloudProf.contact.email, 'jordan.reid@cloudarch.io');
  assert(cloudProf.contact.location.includes('Austin'));
  assert.strictEqual(cloudProf.experience.length, 2);
  assert.strictEqual(cloudProf.experience[0].role, 'Staff Infrastructure Architect');
  assert.strictEqual(cloudProf.experience[0].title, 'Staff Infrastructure Architect');
  assert.strictEqual(cloudProf.experience[0].company, 'Vanguard Cloud Corp');
  assert.strictEqual(cloudProf.experience[0].start_date, '2021');
  assert.strictEqual(cloudProf.experience[0].end_date, 'Present');
  assert(cloudProf.education.length >= 1, 'Education must be extracted');
  assert.strictEqual(cloudProf.education[0].dates, '2014 - 2018', 'Education dates must be synchronized');
  assert(cloudProf.skills.includes('Kubernetes'));
  assert(cloudProf.skills.includes('Terraform'));
  assert.strictEqual(cloudProf.certifications[0].issuer, 'AWS');
  console.log(`   ✔ Jordan Reid Cloud Architect parsed with 100% field precision (Role, Title & Education Dates in sync)`);

  // ── FIXTURE 3: Senior Full-Stack Engineer Resume Test ──────────────────────
  console.log('\n6. Testing Third Test PDF (Senior Full Stack Engineer with Socials & Projects)...');
  const alexPdfPath = path.join(fixturesDir, 'alex_mercer_fullstack_resume.pdf');
  const alexLines = [
    '# ALEX MERCER',
    'Senior Full Stack Engineer',
    'San Francisco, CA | alex.mercer@devtech.org | +1 (415) 888-2910 | US Citizen | linkedin: alexmercer-dev | github: alexmercer-code',
    '## PROFESSIONAL SUMMARY:',
    'Senior Full Stack Engineer with 7+ years of experience designing scalable distributed web platforms, high-throughput microservices, and reactive user interfaces using TypeScript, React, Node.js, and PostgreSQL.',
    '## TECHNICAL SKILLS:',
    'Frontend: React, Next.js, TypeScript, Tailwind CSS, Redux Toolkit',
    'Backend: Node.js, Express, NestJS, GraphQL, REST APIs',
    'Databases: PostgreSQL, MongoDB, Redis, Prisma ORM',
    'DevOps & Tools: Docker, Kubernetes, AWS, Git, Jest',
    '## WORK EXPERIENCE:',
    'Lead Full Stack Engineer',
    'Acme Cloud Systems — San Francisco, CA',
    'Jan 2022 – Present',
    '• Architected event-driven microservices processing 2.5M daily webhook requests using Node.js, Redis, and PostgreSQL.',
    '• Spearheaded migration from legacy monolithic frontend to Next.js and Tailwind CSS, improving Lighthouse score from 58 to 96.',
    'Senior Software Engineer',
    'Beacon Media Labs',
    'Mar 2018 – Dec 2021',
    '• Developed real-time collaborative video analytics dashboard using React, WebSockets, and Express.',
    '• Optimized complex SQL aggregations and indexes in PostgreSQL, reducing 95th percentile query latency from 850ms to 42ms.',
    '## TECHNICAL PROJECTS:',
    'Job Tracking & Intelligence Platform',
    '• Built automated job evaluation and resume intelligence engine with TypeScript, Express, and Tailwind CSS.',
    '## EDUCATION:',
    'B.S. Computer Science 2014 – 2018',
    'University of California, Berkeley',
    '## CERTIFICATIONS:',
    'AWS Certified Developer - Associate — 2023'
  ];

  const alexPdfBuf = await createPdfFromLines(alexPdfPath, alexLines);
  const alexUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'alex_mercer_fullstack_resume.pdf',
    fileBase64: alexPdfBuf.toString('base64')
  });

  assert.strictEqual(alexUploadRes.status, 200);
  const alexProf = alexUploadRes.json.profile;
  assert.strictEqual(alexProf.name.toUpperCase(), 'ALEX MERCER');
  assert(alexProf.target_titles.includes('Senior Full Stack Engineer') || alexProf.target_titles.includes('Lead Full Stack Engineer'));
  assert.strictEqual(alexProf.contact.email, 'alex.mercer@devtech.org');
  assert.strictEqual(alexProf.contact.phone, '+1 (415) 888-2910');
  assert(alexProf.contact.location.includes('San Francisco'));
  assert.strictEqual(alexProf.contact.status, 'US Citizen');
  assert(alexProf.contact.linkedin.includes('alexmercer-dev'), `LinkedIn must contain alexmercer-dev (got ${alexProf.contact.linkedin})`);
  assert(alexProf.contact.github.includes('alexmercer-code'), `GitHub must contain alexmercer-code (got ${alexProf.contact.github})`);
  assert.strictEqual(alexProf.experience.length, 2);
  assert.strictEqual(alexProf.experience[0].role, 'Lead Full Stack Engineer');
  assert.strictEqual(alexProf.experience[0].company, 'Acme Cloud Systems');
  assert.strictEqual(alexProf.experience[1].role, 'Senior Software Engineer');
  assert(alexProf.skills.includes('React'));
  assert(alexProf.skills.includes('TypeScript'));
  assert(alexProf.skills.includes('Node.js'));
  assert(alexProf.skills.includes('PostgreSQL'));
  assert(alexProf.projects.length >= 1, 'Projects must be extracted');
  assert(alexProf.projects[0].name.includes('Job Tracking'), 'Project title must match');
  assert(alexProf.education.length >= 1, 'Education must be extracted');
  assert(alexProf.education[0].institution.includes('University of California, Berkeley'));
  assert(alexProf.certifications.length >= 1, 'Certifications must be extracted');
  assert(alexProf.certifications[0].name.includes('AWS Certified Developer'));
  console.log(`   ✔ Alex Mercer Full-Stack Engineer parsed with 100% field precision (Socials, Projects, Certs, Education)`);

  // ── FIXTURE 4: Resume with Client Name (Must NOT be saved as Highly Confidential) ──
  console.log('\n7. Testing Fourth Test PDF (Consultant Resume with Client Name)...');
  const clientPdfPath = path.join(fixturesDir, 'consultant_with_client_resume.pdf');
  const clientLines = [
    '# DEEPAK VERMA',
    'Senior Business Intelligence Consultant',
    'Chicago, IL | deepak.verma@consultant.io | +1 (312) 555-0144 | linkedin: deepak-verma-bi',
    '## PROFESSIONAL SUMMARY:',
    'Senior BI Consultant with 6+ years driving enterprise data warehousing and reporting solutions for Fortune 500 financial clients.',
    '## TECHNICAL SKILLS:',
    'SQL, Power BI, DAX, Snowflake, Azure Synapse, Tableau, ETL, Python',
    '## PROFESSIONAL EXPERIENCE:',
    'Senior BI Consultant',
    'Cognizant Technology Solutions — Client: Barclays Capital',
    'Jan 2022 – Present',
    '• Designed executive risk monitoring dashboards in Power BI for Barclays Capital credit risk team.',
    '• Optimized complex Snowflake SQL views reducing query runtimes by 40%.',
    'Data Analyst',
    'Wipro Technologies — Client: Apple',
    'Aug 2018 – Dec 2021',
    '• Maintained global inventory KPI pipelines for retail supply chain operations.',
    '## EDUCATION:',
    'Master of Science in Information Systems',
    'University of Illinois Urbana-Champaign',
    '2016 – 2018'
  ];

  const clientPdfBuf = await createPdfFromLines(clientPdfPath, clientLines);
  const clientUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'consultant_with_client_resume.pdf',
    fileBase64: clientPdfBuf.toString('base64')
  });

  assert.strictEqual(clientUploadRes.status, 200);
  const clientProf = clientUploadRes.json.profile;
  assert.strictEqual(clientProf.name.toUpperCase(), 'DEEPAK VERMA');
  assert.strictEqual(clientProf.experience.length, 2);
  assert.strictEqual(clientProf.experience[0].role, 'Senior BI Consultant');
  assert.strictEqual(clientProf.experience[0].title, 'Senior BI Consultant');
  assert.strictEqual(clientProf.experience[0].job_title, 'Senior BI Consultant');
  // Verify client name is preserved and NOT masked as "highly confidential"
  const job1Client = clientProf.experience[0].client;
  assert(job1Client.includes('Barclays'), `Client name must be preserved as Barclays (got "${job1Client}")`);
  assert(!job1Client.toLowerCase().includes('confidential'), `Client name must NEVER be saved as confidential (got "${job1Client}")`);
  const job2Client = clientProf.experience[1].client;
  assert(job2Client.includes('Apple'), `Client name must be preserved as Apple (got "${job2Client}")`);
  assert(!job2Client.toLowerCase().includes('confidential'), `Client name must NEVER be saved as confidential (got "${job2Client}")`);
  // Verify education dates in sync
  assert(clientProf.education[0].dates.includes('2016') && clientProf.education[0].dates.includes('2018'),
    `Education dates must include 2016 and 2018 (got "${clientProf.education[0].dates}")`);
  console.log(`   ✔ Client names preserved verbatim (Barclays, Apple) without masking as "highly confidential"`);

  // ── FIXTURE 5: Education-First Medical/Clinical Scientist Resume (Order: Education -> Experience -> Skills) ──
  console.log('\n8. Testing Fifth Test PDF (Education-First Medical Researcher with Non-standard Order)...');
  const sciPdfPath = path.join(fixturesDir, 'elena_vance_scientist_resume.pdf');
  const sciLines = [
    '# DR. ELENA VANCE',
    'Lead Clinical Data Scientist',
    'Boston, MA | elena.vance@genomics-health.org | +1 (617) 555-9081',
    '## PROFESSIONAL PROFILE:',
    'Clinical Data Scientist and Computational Biologist with 8 years of experience analyzing multi-omic clinical trial datasets and regulatory submissions.',
    '## EDUCATION:',
    'Ph.D. in Computational Biology & Biostatistics 2015 – 2019',
    'Harvard University',
    'B.S. in Biomedical Engineering 2011 – 2015',
    'Massachusetts Institute of Technology (MIT)',
    '## PROFESSIONAL EXPERIENCE:',
    'Lead Clinical Data Scientist',
    'Biogen — Boston, MA',
    'Sep 2021 – Present',
    '• Led phase-3 oncology clinical trial statistical analytics using R and Python.',
    '• Developed survival analysis models published in peer-reviewed journals.',
    'Bioinformatics Scientist',
    'Broad Institute of MIT and Harvard',
    'Jun 2019 – Aug 2021',
    '• Processed high-throughput sequencing pipelines on Google Cloud Platform.',
    '## TECHNICAL SKILLS:',
    'Languages & Tools: Python, R, Bioconductor, SAS, SQL, Docker, Nextflow, GCP'
  ];

  const sciPdfBuf = await createPdfFromLines(sciPdfPath, sciLines);
  const sciUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'elena_vance_scientist_resume.pdf',
    fileBase64: sciPdfBuf.toString('base64')
  });

  assert.strictEqual(sciUploadRes.status, 200);
  const sciProf = sciUploadRes.json.profile;
  assert.strictEqual(sciProf.name, 'DR. ELENA VANCE');
  assert.strictEqual(sciProf.experience.length, 2);
  assert.strictEqual(sciProf.experience[0].role, 'Lead Clinical Data Scientist');
  assert.strictEqual(sciProf.experience[0].title, 'Lead Clinical Data Scientist');
  assert.strictEqual(sciProf.education.length, 2);
  assert(sciProf.education[0].dates.includes('2015') && sciProf.education[0].dates.includes('2019'));
  assert(sciProf.education[1].dates.includes('2011') && sciProf.education[1].dates.includes('2015'));
  assert(sciProf.skills.includes('Python'));
  console.log(`   ✔ Dr. Elena Vance education-first resume parsed cleanly with all education dates & roles synced`);

  // ── FIXTURE 6: Skills-First Product Manager Resume (Order: Skills -> Experience -> Education) ──
  console.log('\n9. Testing Sixth Test PDF (Skills-First Technical Product Manager Resume)...');
  const pmPdfPath = path.join(fixturesDir, 'marcus_vance_pm_resume.pdf');
  const pmLines = [
    '# MARCUS VANCE',
    'Senior Technical Product Manager',
    'Seattle, WA | marcus.vance@prodtech.com | +1 (206) 555-7822 | linkedin: marcusvance-pm',
    '## CORE COMPETENCIES:',
    'Product Strategy, Agile / Scrum, Roadmapping, SQL, Amplitude, Jira, User Research, API Design',
    '## PROFESSIONAL EXPERIENCE:',
    'Principal Product Manager',
    'Amazon Web Services (AWS) — Seattle, WA',
    'Feb 2021 – Present',
    '• Drove product roadmap for serverless computing tools, scaling ARR from $45M to $110M.',
    '• Collaborated directly with enterprise client Capital One to streamline cloud deployments.',
    'Senior Product Manager',
    'Microsoft Corporation — Redmond, WA',
    'Aug 2017 – Jan 2021',
    '• Launched real-time collaboration features in Office 365 with over 15M active daily users.',
    '## ACADEMIC BACKGROUND:',
    'MBA, Technology Management',
    'University of Washington Foster School of Business',
    '2015 – 2017'
  ];

  const pmPdfBuf = await createPdfFromLines(pmPdfPath, pmLines);
  const pmUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'marcus_vance_pm_resume.pdf',
    fileBase64: pmPdfBuf.toString('base64')
  });

  assert.strictEqual(pmUploadRes.status, 200);
  const pmProf = pmUploadRes.json.profile;
  assert.strictEqual(pmProf.name, 'MARCUS VANCE');
  assert.strictEqual(pmProf.experience.length, 2);
  assert.strictEqual(pmProf.experience[0].role, 'Principal Product Manager');
  assert.strictEqual(pmProf.experience[0].title, 'Principal Product Manager');
  assert(pmProf.education[0].dates.includes('2015') && pmProf.education[0].dates.includes('2017'));
  console.log(`   ✔ Marcus Vance skills-first PM resume parsed cleanly with 100% field alignment`);

  // ── TEST NON-RESUME & COVER LETTER REJECTION (VALIDATOR VERIFICATION) ─────────
  console.log('\n10. Testing Strict Non-Resume & Cover Letter Rejections...');

  // A) Formal Cover Letter
  const clPdfPath = path.join(fixturesDir, 'cover_letter_application.pdf');
  const clLines = [
    '# Application for Senior Data Analyst Position',
    'John Doe | j.doe@email.com | +1 (555) 123-4567',
    'October 7, 2026',
    'Dear Hiring Manager,',
    'I am writing to express my enthusiastic interest in the Senior Data Analyst position at your company. With a strong passion for data-driven insights and problem-solving, I believe my background aligns well with your team goals.',
    'Throughout my career, I have continually pushed to uncover trends and build automated reporting solutions. Your organization has an incredible reputation for innovation, and I would love the chance to contribute to your data initiatives.',
    'Thank you for your time and consideration. I look forward to the possibility of discussing how my skills and background meet your needs.',
    'Sincerely,',
    'John Doe'
  ];

  const clPdfBuf = await createPdfFromLines(clPdfPath, clLines);

  // Snapshot master profile before invalid upload
  const masterProfilePath = path.join(__dirname, '..', 'data', 'profiles', 'master-profile.json');
  const profileBeforeCl = fs.existsSync(masterProfilePath) ? fs.readFileSync(masterProfilePath, 'utf8') : null;

  const clUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'cover_letter_application.pdf',
    fileBase64: clPdfBuf.toString('base64')
  });

  // MUST be rejected with HTTP 422
  assert.strictEqual(clUploadRes.status, 422, 'Cover letter must be rejected with HTTP 422');
  assert.strictEqual(clUploadRes.json.success, false);
  assert(clUploadRes.json.message.includes('Format or resume is not correct please fill the below master profile from UI'),
    `Message must prompt user to fill from UI. Got: ${clUploadRes.json.message}`);
  
  // Master profile MUST NOT have been updated
  const profileAfterCl = fs.existsSync(masterProfilePath) ? fs.readFileSync(masterProfilePath, 'utf8') : null;
  assert.strictEqual(profileBeforeCl, profileAfterCl, 'Master profile JSON must NOT be updated when a cover letter is uploaded');
  console.log(`   ✔ Cover Letter rejected with HTTP 422 & prompt to fill from UI. Master profile JSON preserved.`);

  // B) Job Description Document
  const jdPdfPath = path.join(fixturesDir, 'job_description_posting.pdf');
  const jdLines = [
    '# Senior Infrastructure Engineer - Job Description',
    'Acme Global Corp — Remote / Hybrid',
    'About the role:',
    'We are looking for an experienced Senior Infrastructure Engineer to lead our cloud reliability initiatives.',
    'Key Responsibilities:',
    '• Build and maintain multi-region Kubernetes clusters.',
    '• Monitor system health and respond to P1 operational incidents.',
    'Requirements:',
    '• 5+ years of experience in AWS, GCP, or Azure.',
    '• Proficiency in Terraform, Go, or Python.',
    'What we offer: Competitive salary, 401(k) matching, and comprehensive healthcare.',
    'To apply: Submit your application to jobs@acmecorp.com by end of month.'
  ];

  const jdPdfBuf = await createPdfFromLines(jdPdfPath, jdLines);
  const jdUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'job_description_posting.pdf',
    fileBase64: jdPdfBuf.toString('base64')
  });

  assert.strictEqual(jdUploadRes.status, 422, 'Job description must be rejected with HTTP 422');
  assert.strictEqual(jdUploadRes.json.success, false);
  assert(jdUploadRes.json.message.includes('Format or resume is not correct please fill the below master profile from UI'));
  console.log(`   ✔ Job Description rejected with HTTP 422 & prompt to fill from UI`);

  // C) Commercial Invoice Document
  const invoicePdfPath = path.join(fixturesDir, 'commercial_invoice.pdf');
  const invoiceLines = [
    '# TAX INVOICE #INV-98122',
    'Acme Consulting Services LLC',
    'Invoice Date: Oct 01, 2026 | Due Date: Oct 31, 2026',
    'Bill To: Global Tech Enterprises',
    'Description: Cloud Architecture Advisory Services',
    'Subtotal: $12,500.00',
    'Tax (8.25%): $1,031.25',
    'Total Amount Due: $13,531.25',
    'Payment Terms: Net 30. Wire transfer details provided below.'
  ];

  const invoicePdfBuf = await createPdfFromLines(invoicePdfPath, invoiceLines);
  const invoiceUploadRes = await request('POST', '/api/profile/upload-resume', {
    filename: 'commercial_invoice.pdf',
    fileBase64: invoicePdfBuf.toString('base64')
  });

  assert.strictEqual(invoiceUploadRes.status, 422, 'Invoice must be rejected with HTTP 422');
  assert.strictEqual(invoiceUploadRes.json.success, false);
  assert(invoiceUploadRes.json.message.includes('Format or resume is not correct please fill the below master profile from UI'));
  console.log(`   ✔ Commercial Invoice rejected with HTTP 422 & prompt to fill from UI`);



  console.log('\n' + '='.repeat(70));
  console.log('🎉 ALL RESUME PDF PARSING, CLIENT FIDELITY & VALIDATION TESTS PASSED!');
  console.log('='.repeat(70) + '\n');
}

runPdfTests().catch(err => {
  console.error('\n❌ PDF Resume Test failed:', err);
  process.exit(1);
});
