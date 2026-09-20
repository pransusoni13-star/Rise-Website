const { timingSafeEqual } = require('node:crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  const expected = process.env.WAITLIST_ADMIN_TOKEN || '';
  const supplied = String(req.headers.authorization || '');
  const expectedHeader = `Bearer ${expected}`;

  if (!expected || supplied.length !== expectedHeader.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expectedHeader))) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Database configuration is missing.' });
  }

  async function db(endpoint, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || `Supabase returned ${response.status}.`);
    return data;
  }

  const readRows = () => db(
    'waitlist?select=waitlist_number,name,email,joined_at&order=joined_at.asc,waitlist_number.asc'
  );

  const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

  function summarize(rows) {
    const emailCounts = new Map();
    for (const row of rows) {
      const email = String(row.email || '').trim().toLowerCase();
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    }
    const numbers = rows.map((row) => Number(row.waitlist_number)).sort((a, b) => a - b);
    const gaps = [];
    for (let number = 1; number <= numbers.length; number++) {
      if (numbers[number - 1] !== number) gaps.push(number);
    }
    return {
      totalRows: rows.length,
      uniqueEmails: emailCounts.size,
      duplicateGroups: [...emailCounts.values()].filter((count) => count > 1).length,
      duplicateRows: [...emailCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      minimumNumber: numbers[0] ?? null,
      maximumNumber: numbers.at(-1) ?? null,
      contiguousFromOne: gaps.length === 0 && (numbers.length === 0 || numbers.at(-1) === numbers.length),
      missingNumbers: gaps.slice(0, 100),
    };
  }

  try {
    const beforeRows = await readRows();
    const before = summarize(beforeRows);

    if (req.method === 'GET') {
      return res.status(200).json({ success: true, audit: before });
    }

    const requestedNames = req.method === 'DELETE' && Array.isArray(req.body?.names)
      ? new Set(req.body.names.map(normalizeName).filter(Boolean))
      : new Set();
    const requestedRemovalNumbers = beforeRows
      .filter((row) => requestedNames.has(normalizeName(row.name)))
      .map((row) => Number(row.waitlist_number));

    if (requestedRemovalNumbers.length) {
      await db(`waitlist?waitlist_number=in.(${requestedRemovalNumbers.join(',')})`, { method: 'DELETE' });
    }

    const rowsAfterRequestedRemoval = requestedRemovalNumbers.length ? await readRows() : beforeRows;
    const seen = new Set();
    const keep = [];
    const duplicateNumbers = [];
    for (const row of rowsAfterRequestedRemoval) {
      const email = String(row.email || '').trim().toLowerCase();
      if (seen.has(email)) duplicateNumbers.push(Number(row.waitlist_number));
      else {
        seen.add(email);
        keep.push({ ...row, email });
      }
    }

    if (duplicateNumbers.length) {
      await db(`waitlist?waitlist_number=in.(${duplicateNumbers.join(',')})`, { method: 'DELETE' });
    }

    const ordered = keep.sort((a, b) =>
      String(a.joined_at || '').localeCompare(String(b.joined_at || '')) ||
      Number(a.waitlist_number) - Number(b.waitlist_number)
    );

    const needsRenumber = ordered.some((row, index) => Number(row.waitlist_number) !== index + 1);
    if (needsRenumber) {
      await Promise.all(ordered.map((row, index) => db(
        `waitlist?waitlist_number=eq.${encodeURIComponent(row.waitlist_number)}`,
        { method: 'PATCH', body: JSON.stringify({ waitlist_number: -1000000 - index }) }
      )));
      await Promise.all(ordered.map((row, index) => db(
        `waitlist?waitlist_number=eq.${-1000000 - index}`,
        { method: 'PATCH', body: JSON.stringify({ waitlist_number: index + 1, email: row.email }) }
      )));
    }

    const afterRows = await readRows();
    const after = summarize(afterRows);
    if (after.duplicateRows !== 0 || !after.contiguousFromOne) {
      throw new Error('Post-repair verification failed.');
    }

    return res.status(200).json({
      success: true,
      removedRequestedNames: requestedRemovalNumbers.length,
      removedDuplicates: duplicateNumbers.length,
      renumbered: needsRenumber,
      before,
      after,
    });
  } catch (error) {
    console.error('Waitlist maintenance error:', error);
    return res.status(500).json({ success: false, error: 'Waitlist maintenance failed.' });
  }
};
