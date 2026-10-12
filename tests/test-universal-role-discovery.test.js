const test = require('node:test');
const assert = require('node:assert/strict');
const { discoverMarketRoles } = require('../scripts/engine/market-role-discovery');

test('Universal Role Discovery: Full Stack Developer expands to 5-10 market titles', () => {
  const profile = {
    role: 'Full Stack Developer',
    years_of_experience: 5,
    skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Express'],
    summary: 'Senior Full Stack Developer specializing in TypeScript and React applications.'
  };

  const roles = discoverMarketRoles(['Full Stack Developer'], profile);
  assert.ok(roles.length >= 6 && roles.length <= 10, `Expected 6-10 roles, got ${roles.length}`);
  assert.ok(roles.includes('Full Stack Developer'));
  assert.ok(roles.includes('Software Engineer'));
  assert.ok(roles.includes('Frontend Developer'));
  assert.ok(roles.includes('Backend Developer'));
  assert.ok(roles.includes('React Developer'));
});

test('Universal Role Discovery: Mobile Developer expands to 5-10 market titles', () => {
  const profile = {
    role: 'Mobile Developer',
    years_of_experience: 4,
    skills: ['Swift', 'iOS', 'Kotlin', 'React Native'],
    summary: 'Mobile developer building cross-platform and native iOS apps.'
  };

  const roles = discoverMarketRoles(['Mobile Developer'], profile);
  assert.ok(roles.length >= 5 && roles.length <= 10, `Expected 5-10 roles, got ${roles.length}`);
  assert.ok(roles.includes('Mobile Developer'));
  assert.ok(roles.includes('iOS Developer'));
  assert.ok(roles.includes('React Native Developer'));
});

test('Universal Role Discovery: DevOps / Cloud Engineer expands to 5-10 market titles', () => {
  const profile = {
    role: 'DevOps Engineer',
    years_of_experience: 6,
    skills: ['Docker', 'Kubernetes', 'AWS', 'Terraform', 'CI/CD'],
    summary: 'Cloud Infrastructure Engineer.'
  };

  const roles = discoverMarketRoles(['DevOps Engineer'], profile);
  assert.ok(roles.length >= 5 && roles.length <= 10, `Expected 5-10 roles, got ${roles.length}`);
  assert.ok(roles.includes('DevOps Engineer'));
  assert.ok(roles.includes('Cloud Engineer'));
  assert.ok(roles.includes('Site Reliability Engineer (SRE)'));
});

test('Universal Role Discovery: Product Manager expands to 5-10 market titles', () => {
  const profile = {
    role: 'Product Manager',
    years_of_experience: 4,
    skills: ['Product Roadmap', 'Agile', 'Scrum', 'User Stories'],
    summary: 'Technical Product Manager leading SaaS product roadmaps.'
  };

  const roles = discoverMarketRoles(['Product Manager'], profile);
  assert.ok(roles.length >= 5 && roles.length <= 10, `Expected 5-10 roles, got ${roles.length}`);
  assert.ok(roles.includes('Product Manager'));
  assert.ok(roles.includes('Technical Product Manager'));
  assert.ok(roles.includes('Product Owner'));
});

test('Universal Role Discovery: Healthcare / Nurse expands to 4-10 market titles', () => {
  const profile = {
    role: 'Registered Nurse',
    years_of_experience: 7,
    skills: ['Patient Care', 'ICU', 'Clinical Assessment'],
    summary: 'ICU Registered Nurse at Memorial Hospital.'
  };

  const roles = discoverMarketRoles(['Registered Nurse'], profile);
  assert.ok(roles.length >= 4 && roles.length <= 10, `Expected 4-10 roles, got ${roles.length}`);
  assert.ok(roles.includes('Registered Nurse'));
  assert.ok(roles.includes('Clinical Nurse Specialist'));
});

test('Universal Role Discovery: Uncatalogued discipline (GIS Mapping Specialist) expands dynamically', () => {
  const profile = {
    role: 'GIS Mapping Specialist',
    years_of_experience: 3,
    skills: ['ArcGIS', 'QGIS', 'Cartography'],
    summary: 'GIS professional creating spatial maps.'
  };

  const roles = discoverMarketRoles(['GIS Mapping Specialist'], profile);
  assert.ok(roles.length >= 4 && roles.length <= 10, `Expected 4-10 roles, got ${roles.length}`);
  assert.ok(roles.includes('GIS Mapping Specialist'));
  // Zero Data Analyst leakage into GIS role
  assert.ok(!roles.includes('Data Analyst'));
});

test('Universal Role Discovery: Empty profile generates dynamic roles without hardcoding Data Analyst', () => {
  const profile = {
    headline: 'Cybersecurity Consultant',
    skills: ['SIEM', 'Splunk', 'SOC']
  };

  const roles = discoverMarketRoles([], profile);
  assert.ok(roles.length >= 4 && roles.length <= 10, `Expected 4-10 roles, got ${roles.length}`);
  assert.ok(!roles.includes('Data Analyst'), 'Should not invent Data Analyst for Cybersecurity');
  assert.ok(roles.some(r => /cyber|security|soc/i.test(r)));
});
