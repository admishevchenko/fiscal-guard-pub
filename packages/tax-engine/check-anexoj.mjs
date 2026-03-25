import Decimal from 'decimal.js';

const { mapToAnexoJ } = await import('./dist/AnexoJMapper.js');

const evt = {
  id: 'evt1',
  userId: 'u1',
  taxYear: 2024,
  sourceCountry: 'US',
  source: 'FOREIGN',
  category: 'E',
  grossAmountCents: 100000,
  description: 'Dividend from Acme Corp',
  receivedAt: '2024-06-01T00:00:00Z',
};

const xml = mapToAnexoJ([evt]);
console.log(xml);

const ok = xml.includes('<C1>USA</C1>') && xml.includes('<C2>401</C2>') && xml.includes('<C3>1000.00</C3>');
if (ok) {
  console.log('Check passed');
  process.exit(0);
} else {
  console.error('Check failed');
  process.exit(1);
}
