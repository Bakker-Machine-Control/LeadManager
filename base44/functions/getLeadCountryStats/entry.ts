import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Landcode-voorvoegsels voor records zonder phone_country (langste prefix eerst)
const PREFIXES = [
  ['353', 'IE'], ['352', 'LU'], ['351', 'PT'], ['420', 'CZ'], ['421', 'SK'],
  ['47', 'NO'], ['46', 'SE'], ['45', 'DK'], ['44', 'GB'], ['43', 'AT'],
  ['41', 'CH'], ['39', 'IT'], ['34', 'ES'], ['33', 'FR'], ['32', 'BE'],
  ['31', 'NL'], ['49', 'DE'], ['48', 'PL'], ['61', 'AU'], ['64', 'NZ'],
  ['27', 'ZA'], ['52', 'MX'], ['55', 'BR'], ['51', 'CL'], ['91', 'IN'],
  ['60', 'MY'], ['62', 'ID'], ['63', 'PH'], ['65', 'SG'], ['66', 'TH'],
  ['81', 'JP'], ['82', 'KR'], ['84', 'VN'], ['86', 'CN'],
  ['7', 'RU'],
  ['1', 'US'],
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const counts = {};
    let total = 0;
    let skip = 0;

    while (true) {
      const batch = await base44.entities.Lead.list('-created_date', 1000, skip);
      batch.forEach(r => {
        total++;
        let code = (r.phone_country || '').toUpperCase();
        if (!code) {
          const e164 = typeof r.phone_e164 === 'string' ? r.phone_e164 : '';
          code = 'ONBEKEND';
          if (e164.startsWith('+')) {
            const digits = e164.slice(1);
            for (const [prefix, iso] of PREFIXES) {
              if (digits.startsWith(prefix)) { code = iso; break; }
            }
          }
        }
        counts[code] = (counts[code] || 0) + 1;
      });
      if (batch.length < 1000) break;
      skip += 1000;
    }

    const byCountry = Object.entries(counts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    console.log(`Landstatistiek: ${total} leads over ${byCountry.length} landen`);
    return Response.json({ total, byCountry });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}