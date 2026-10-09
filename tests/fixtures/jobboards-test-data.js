/**
 * tests/fixtures/jobboards-test-data.js
 * Comprehensive mock fixtures, candidate profiles, and simulated API responses for all 18+ job boards.
 */

const CANDIDATE_TEST_PROFILES = Object.freeze({
  canada_analyst: {
    name: 'Sarah Chen',
    target_titles: ['Data Analyst', 'Senior Data Analyst'],
    locations: ['Toronto, ON, Canada', 'Remote'],
    country_scope: 'CA',
    work_type: 'Hybrid & Remote',
    skills: ['SQL', 'Power BI', 'Python', 'Tableau', 'ETL']
  },
  us_engineer: {
    name: 'David Miller',
    target_titles: ['Full Stack Engineer', 'Software Engineer'],
    locations: ['Austin, TX', 'Remote'],
    country_scope: 'US',
    work_type: 'Remote',
    skills: ['Node.js', 'React', 'PostgreSQL', 'Docker', 'AWS']
  },
  germany_developer: {
    name: 'Lukas Weber',
    target_titles: ['Backend Developer', 'Software Engineer'],
    locations: ['Berlin, Germany', 'Remote'],
    country_scope: 'DE',
    work_type: 'Open to All',
    skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Kubernetes']
  },
  uk_scientist: {
    name: 'Emma Watson',
    target_titles: ['Data Scientist', 'Machine Learning Engineer'],
    locations: ['London, UK', 'Remote'],
    country_scope: 'GB',
    work_type: 'Hybrid',
    skills: ['Python', 'PyTorch', 'SQL', 'Scikit-Learn']
  },
  singapore_cloud: {
    name: 'Wei Zhang',
    target_titles: ['Cloud Architect', 'DevOps Engineer'],
    locations: ['Singapore', 'Remote'],
    country_scope: 'SG',
    work_type: 'Open to All',
    skills: ['Terraform', 'AWS', 'GCP', 'Kubernetes', 'CI/CD']
  },
  global_remote: {
    name: 'Alex Rivera',
    target_titles: ['Frontend Engineer', 'React Developer'],
    locations: ['Remote'],
    country_scope: 'GLOBAL',
    work_type: 'Remote',
    skills: ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Tailwind CSS']
  }
});

const MOCK_BOARD_RESPONSES = Object.freeze({
  adzuna: {
    results: [
      {
        id: '4481928371',
        title: '<strong>Senior Data Analyst</strong> - Enterprise BI',
        company: { display_name: 'Shopify' },
        location: { display_name: 'Toronto, ON' },
        created: new Date().toISOString(),
        description: 'Seeking a Senior Data Analyst with strong SQL, Power BI, and Python skills to model customer churn.',
        redirect_url: 'https://www.adzuna.ca/land/ad/4481928371?utm_source=test',
        salary_min: 95000,
        salary_max: 130000
      },
      {
        id: '4481928372',
        title: 'Data Analyst (Remote - Canada)',
        company: { display_name: 'Wealthsimple' },
        location: { display_name: 'Canada (Remote)' },
        created: new Date().toISOString(),
        description: 'Analyze financial datasets, build reporting pipelines, and design automated dashboards.',
        redirect_url: 'https://www.adzuna.ca/land/ad/4481928372',
        salary_min: 85000,
        salary_max: 110000
      }
    ]
  },

  canada_job_bank: `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="results-list">
          <article>
            <h3><span class="noctitle">New Senior Data Analyst</span></h3>
            <a href="/jobsearch/jobposting/41928301;jsessionid=xyz">View Posting</a>
            <li class="business">Royal Bank of Canada</li>
            <li class="location">Location Toronto, ON</li>
            <li class="salary">Salary $95,000 - $120,000 annually</li>
            <li class="source">Direct Employer</li>
          </article>
          <article>
            <h3><span class="noctitle">Data Analyst - Remote</span></h3>
            <a href="/jobsearch/jobposting/41928302">View Posting</a>
            <li class="business">Manulife Financial</li>
            <li class="location">Location Canada (Telework / Remote)</li>
            <li class="salary">Salary $80,000 - $105,000 annually</li>
            <li class="source">Job Bank Verified</li>
          </article>
        </div>
      </body>
    </html>
  `,

  canada_job_bank_details: `
    <html>
      <body>
        <div id="job-details">
          <h2>Job details</h2>
          <p>We are hiring a Senior Data Analyst to join our Risk Analytics team. Requirements: 5+ years SQL, ETL pipelines, Power BI, Python modeling.</p>
          <p>Important notice: Job Bank does not guarantee validity...</p>
        </div>
      </body>
    </html>
  `,

  linkedin: `
    <ul class="jobs-search__results-list">
      <li>
        <div class="base-card" data-entity-urn="urn:li:jobPosting:4475431912">
          <h3 class="base-search-card__title">Senior Data Analyst</h3>
          <h4 class="base-search-card__subtitle"><a href="#">Robert Half</a></h4>
          <span class="job-search-card__location">Toronto, Ontario, Canada</span>
          <time datetime="${new Date().toISOString()}">1 day ago</time>
          <a class="base-card__full-link" href="https://ca.linkedin.com/jobs/view/senior-data-analyst-at-robert-half-4475431912">Apply</a>
        </div>
      </li>
      <li>
        <div class="base-card" data-entity-urn="urn:li:jobPosting:4475431913">
          <h3 class="base-search-card__title">Data Analyst - Product Intelligence</h3>
          <h4 class="base-search-card__subtitle">Scotiabank</h4>
          <span class="job-search-card__location">Toronto, Ontario, Canada (Hybrid)</span>
          <time datetime="${new Date().toISOString()}">3 hours ago</time>
          <a class="base-card__full-link" href="https://ca.linkedin.com/jobs/view/data-analyst-at-scotiabank-4475431913">Apply</a>
        </div>
      </li>
    </ul>
  `,

  usajobs: {
    SearchResult: {
      SearchResultCount: 2,
      SearchResultItems: [
        {
          MatchedObjectId: '782910291',
          MatchedObjectDescriptor: {
            PositionTitle: 'Data Analyst (GS-13)',
            OrganizationName: 'Department of the Treasury',
            PositionLocationDisplay: 'Washington, DC (Remote Eligible)',
            PublicationStartDate: new Date().toISOString(),
            PositionRemuneration: [{ MinimumRange: '112015', MaximumRange: '145617', Description: 'Per Year' }],
            PositionURI: 'https://www.usajobs.gov/job/782910291',
            UserArea: {
              Details: {
                MajorDuties: ['Conduct statistical data analysis using SQL and Python', 'Prepare executive briefings']
              }
            }
          }
        }
      ]
    }
  },

  jobicy: {
    jobs: [
      {
        id: 152315,
        url: 'https://jobicy.com/jobs/152315-senior-data-analyst-gtm',
        jobTitle: 'Senior Data Analyst, GTM',
        companyName: 'Tremendous',
        companyLogo: 'https://jobicy.com/logos/tremendous.png',
        jobGeo: 'USA, Canada, Anywhere (100% Remote)',
        jobLevel: 'Senior',
        pubDate: new Date().toISOString(),
        annualSalaryMin: 110000,
        annualSalaryMax: 140000,
        jobDescription: 'Looking for a Senior Data Analyst to lead our GTM data infrastructure, SQL pipelines, and executive dashboards.'
      }
    ]
  },

  remotive: {
    jobs: [
      {
        id: 198234,
        url: 'https://remotive.com/remote-jobs/data/senior-data-analyst-198234',
        title: 'Senior Data Analyst',
        company_name: 'Zapier',
        candidate_required_location: 'Worldwide / Remote',
        publication_date: new Date().toISOString(),
        salary: '$115,000 - $145,000',
        description: 'Zapier is looking for a Senior Data Analyst with advanced SQL and Python skills to build automated attribution models.'
      }
    ]
  },

  arbeitnow: {
    data: [
      {
        slug: 'data-analyst-zalando-berlin-123',
        title: 'Data Analyst - Customer Analytics',
        company_name: 'Zalando SE',
        location: 'Berlin, Germany',
        remote: true,
        created_at: Math.floor(Date.now() / 1000),
        url: 'https://www.arbeitnow.com/view/data-analyst-zalando-123',
        description: 'Join Zalando as a Data Analyst. Work with BigQuery, SQL, and Tableau to analyze consumer behavior.',
        tags: ['SQL', 'Python', 'BigQuery', 'Tableau']
      }
    ]
  },

  himalayas: {
    jobs: [
      {
        title: 'Data Analyst',
        companyName: 'GitLab',
        location: 'Everywhere (Remote)',
        pubDate: new Date().toISOString(),
        applicationLink: 'https://himalayas.app/jobs/gitlab-data-analyst',
        excerpt: 'Contribute to open core analytics with PostgreSQL, dbt, Snowflake, and Python.'
      }
    ]
  },

  indeed: `<?xml version="1.0" encoding="utf-8"?>
    <rss version="2.0">
      <channel>
        <title>Indeed Jobs</title>
        <item>
          <title>Senior Data Analyst - Deloitte - Toronto, ON</title>
          <link>https://ca.indeed.com/viewjob?jk=abc123indeed</link>
          <description>Lead data governance, enterprise dashboards, and ETL workflows using SQL and Power BI.</description>
          <source>Deloitte</source>
          <pubDate>${new Date().toUTCString()}</pubDate>
        </item>
      </channel>
    </rss>
  `,

  arbeitsagentur: {
    stellenangebote: [
      {
        refnr: '10000-1234567890-S',
        titel: 'Data Analyst (m/w/d) Business Intelligence',
        arbeitgeber: 'Siemens AG',
        arbeitsort: { ort: 'München', region: 'Bayern', land: 'Deutschland' },
        eintrittsdatum: new Date().toISOString(),
        aktuelleVollarbeitszeit: 'VOLLZEIT',
        externeUrl: 'https://jobs.siemens.com/data-analyst-123'
      }
    ]
  },

  mycareersfuture: {
    data: {
      results: [
        {
          uuid: 'mcf-sg-987654321',
          title: 'Senior Data Analyst (FinTech)',
          postedCompany: { name: 'DBS Bank Ltd' },
          address: { district: 'Marina Bay Financial Centre' },
          metadata: { updatedAt: new Date().toISOString() },
          salary: { minimum: 7500, maximum: 11000, type: { text: 'Monthly' } },
          schemes: [{ name: 'Government Verified ACRA' }]
        }
      ]
    }
  },

  seek: {
    data: [
      {
        id: '76543210',
        title: 'Senior Data Analyst',
        advertiser: { description: 'Atlassian' },
        location: 'Sydney, NSW',
        listingDate: new Date().toISOString(),
        teaser: 'Drive product metrics, experimentation, and telemetry using SQL and Amplitude.'
      }
    ]
  },

  reed: {
    results: [
      {
        jobId: 50982341,
        jobTitle: 'Senior Data Analyst',
        employerName: 'Monzo Bank',
        locationName: 'London, Greater London',
        date: new Date().toLocaleDateString('en-GB'),
        jobUrl: 'https://www.reed.co.uk/jobs/senior-data-analyst/50982341',
        jobDescription: 'Build core financial dashboards and fraud reporting models using BigQuery, SQL, and Python.'
      }
    ]
  },

  bayt: `
    <html>
      <head>
        <script type="application/ld+json">
        [
          {
            "@type": "JobPosting",
            "title": "Senior Data Analyst",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "Emirates NBD"
            },
            "jobLocation": {
              "@type": "Place",
              "address": {
                "addressLocality": "Dubai, UAE"
              }
            },
            "url": "https://www.bayt.com/en/uae/jobs/senior-data-analyst-987123/",
            "description": "Experienced Data Analyst to optimize retail banking data pipelines and Power BI reporting.",
            "datePosted": "${new Date().toISOString()}"
          }
        ]
        </script>
      </head>
      <body><div>Jobs in UAE</div></body>
    </html>
  `,

  wttj: {
    jobs: [
      {
        id: 'wttj-98124',
        name: 'Data Analyst',
        slug: 'data-analyst-98124',
        organization: { name: 'Doctolib', slug: 'doctolib' },
        office: { city: 'Paris', country: 'France' },
        published_at: new Date().toISOString(),
        profile: 'Analyze user funnels, consult stakeholders, and deploy Looker and dbt models.'
      }
    ]
  },

  naukri: `
    <html>
      <body>
        <div class="srp-jobtuple-wrapper">
          <article>
            <a class="title" href="https://www.naukri.com/job-listings-senior-data-analyst-infosys-817263">Senior Data Analyst</a>
            <a class="comp-name">Infosys Limited</a>
            <span class="loc-wrap">Bangalore, India</span>
          </article>
        </div>
      </body>
    </html>
  `,

  daijob: `
    <div class="gp-jobs-container">
      <div class="gp-job-item">
        <h3><a href="https://jobs.gaijinpot.com/job/view/job_id/4412">Senior Data Analyst</a></h3>
        <div class="gp-job-item__company">Rakuten Group, Inc.</div>
        <div class="gp-job-item__location">Tokyo, Japan</div>
      </div>
    </div>
  `,

  vagas: `
    <div class="vagas-results">
      <article class="vaga">
        <h2 class="cargo"><a href="https://www.vagas.com.br/vagas/v9988/data-analyst">Senior Data Analyst</a></h2>
        <span class="empr">Nubank</span>
        <span class="vaga-local">São Paulo, Brasil</span>
      </article>
    </div>
  `
});

module.exports = {
  CANDIDATE_TEST_PROFILES,
  MOCK_BOARD_RESPONSES
};
