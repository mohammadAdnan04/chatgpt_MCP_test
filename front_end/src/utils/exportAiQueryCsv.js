'use client'

export const aiHeaders = [
  'profileUrl',
  'profileName',
  'company',
  'location',
  'summary',
  'emails',
  'phones',
  'currentJob',
  'jobHistory',
];

const q = (v) => {
  const s = v == null ? '' : String(v);
  const t = s.replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return `"${t}"`;
};

const jobLine = (job) => {
  if (!job) return '';
  const title = job.title || job.role || 'Role';
  const comp = job.companyName || job.company || 'Company';
  const start = job.startDate || '';
  const end = job.current ? 'present' : (job.endDate || '');
  const range = start || end ? ` (${start} – ${end})` : '';
  return `${title} @ ${comp}${range}`;
};

const pickEmails = (raw) => {
  const src = Array.isArray(raw.contact__all_emails)
    ? raw.contact__all_emails
    : (Array.isArray(raw.contact__emails) ? raw.contact__emails : []);
  const list = [];
  src.forEach((e)=>{
    const addr = e?.email || e?.sanitized_email;
    if (!addr) return;
    list.push(addr);
  });
  if (!list.length && typeof raw.email === 'string' && raw.email.trim()) {
    raw.email.split(/[;,]+/).map((s)=>s.trim()).filter(Boolean).forEach((em)=> list.push(em));
  }
  return list;
};

const parseTypedStrings = (s) => {
  const out = [];
  if (!s) return out;
  s.split(',').map((v)=> v.trim()).filter(Boolean).forEach((v)=>{
    const m = v.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    const num = m ? m[1].trim() : v;
    const type = m ? m[2].trim().toLowerCase() : '';
    out.push({ number: num, type });
  });
  return out;
};

const pickPhones = (raw) => {
  const arr = Array.isArray(raw.contact__phone_numbers) ? raw.contact__phone_numbers : [];
  let out = arr.map((p)=> ({ number: p?.sanitized_number || p?.raw_number || '', type: (p?.type || '').toLowerCase() }))
    .filter((x)=> x.number);
  out = out.concat(parseTypedStrings(raw.phone));
  out = out.concat(parseTypedStrings(raw.second_phone));
  out = out.concat(parseTypedStrings(raw.corporate_phone));
  const canon = (num) => String(num||'').replace(/[^+\d]/g, '');
  const dedup = [];
  out.forEach((x)=> { const c = canon(x.number); if (c && !dedup.find((y)=> canon(y.number) === c)) dedup.push(x); });
  return dedup.map((p)=> String(p.number || '').replace(/^'+/, ''));
};

export const buildAiQueryCsv = (items) => {
  const header = aiHeaders.map(q).join(',');
  const lines = items.map((it)=> {
    const raw = it?.raw || {};
    const profileUrl = raw.public_profile_url || raw.linkedin_url || raw.profile_url || '';
    const name = raw.name || `${raw.first_name || ''} ${raw.last_name || ''}`.trim();
    const company = raw.company || (Array.isArray(raw.current_positions) ? (raw.current_positions[0]?.company || '') : '');
    const location = raw.location || [raw.contact__city, raw.contact__state, raw.contact__country].filter(Boolean).join(', ');
    const headline = raw.headline || ((raw.title && company) ? `${raw.title} at ${company}` : '');
    const emails = pickEmails(raw).join('; ');
    const phones = pickPhones(raw).join('; ');
    const currentJob = raw.title || (Array.isArray(raw.current_positions) ? raw.current_positions[0]?.role || '' : '');
    const jobHistory = Array.isArray(raw.employmentHistory)
      ? raw.employmentHistory.map(jobLine).filter(Boolean).join(' | ')
      : '';
    const row = [profileUrl, name, company, location, headline, emails, phones, currentJob, jobHistory];
    return row.map(q).join(',');
  });
  const csv = [header, ...lines].join('\r\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
};

