const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { discoverMarketRoles } = require('../scripts/engine/market-role-discovery');

describe('Market Role Discovery Engine', () => {
  test('Expands single "Data Analyst" title into rich set of 5-10 market titles based on tools & domain', () => {
    const profile = {
      role: 'Data Analyst',
      years_of_experience: 5,
      skills: ['SQL', 'Power BI', 'Python', 'Pandas', 'Excel', 'ETL', 'BigQuery'],
      summary: 'Data Analyst with 5 years experience across retail banking and energy trading.',
      experience: [
        { role: 'Data Analyst II', company: 'TD Bank', bullets: ['Power BI dashboards', 'SQL queries'] }
      ]
    };

    const roles = discoverMarketRoles(['Data Analyst'], profile);
    assert.ok(Array.isArray(roles));
    assert.ok(roles.length >= 5 && roles.length <= 10);
    assert.ok(roles.includes('Data Analyst'));
    assert.ok(roles.includes('Business Intelligence Analyst'));
    assert.ok(roles.includes('Power BI Developer'));
    assert.ok(roles.includes('Reporting Analyst'));
    assert.ok(roles.includes('Financial Data Analyst'));
    assert.ok(roles.includes('Analytics Engineer'));

    // Verify zero seniority inflation
    const bannedInflation = /\b(?:Director|VP|Vice President|Head of|Chief)\b/i;
    for (const r of roles) {
      assert.ok(!bannedInflation.test(r), `Title "${r}" should not be inflated`);
    }
  });

  test('Expands single "Software Engineer" title into frontend, backend, and full-stack market roles', () => {
    const profile = {
      role: 'Software Engineer',
      years_of_experience: 4,
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Express', 'PostgreSQL'],
      summary: 'Software Engineer building modern web apps.',
      experience: [{ role: 'Software Engineer', company: 'Tech Inc' }]
    };

    const roles = discoverMarketRoles(['Software Engineer'], profile);
    assert.ok(roles.length >= 5 && roles.length <= 10);
    assert.ok(roles.includes('Software Engineer'));
    assert.ok(roles.includes('Full Stack Developer'));
    assert.ok(roles.includes('Frontend Developer'));
    assert.ok(roles.includes('React Developer'));
    assert.ok(roles.includes('Backend Developer'));
  });

  test('Expands single "DevOps Engineer" title into Cloud, SRE, and Platform market roles', () => {
    const profile = {
      role: 'DevOps Engineer',
      years_of_experience: 6,
      skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'CI/CD', 'Linux'],
      summary: 'DevOps Engineer maintaining cloud infrastructure.',
      experience: [{ role: 'DevOps Engineer', company: 'Cloud Corp' }]
    };

    const roles = discoverMarketRoles(['DevOps Engineer'], profile);
    assert.ok(roles.length >= 5 && roles.length <= 10);
    assert.ok(roles.includes('DevOps Engineer'));
    assert.ok(roles.includes('Cloud Engineer'));
    assert.ok(roles.includes('Platform Engineer'));
    assert.ok(roles.includes('Site Reliability Engineer (SRE)'));
    assert.ok(roles.includes('AWS Cloud Engineer'));
  });

  test('Strictly bounds output at 10 roles maximum and rejects buzzwords', () => {
    const profile = {
      role: 'Data Analyst',
      years_of_experience: 5,
      skills: ['SQL', 'Power BI', 'Python', 'Tableau', 'Excel', 'ETL', 'dbt', 'Snowflake'],
      summary: 'Data Analyst with banking and healthcare experience.'
    };

    const roles = discoverMarketRoles(['Data Analyst', 'Data Ninja', 'Analytics Rockstar'], profile);
    assert.ok(roles.length <= 10);
    assert.ok(!roles.some(r => /ninja|rockstar/i.test(r)));
  });
});
