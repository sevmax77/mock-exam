import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';
import {
  getNetworkCandidates,
  pickPreferredIp,
  printIphoneUrlHelp,
} from './network-addresses.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const certDir = path.join(projectRoot, '.cert');
const keyPath = path.join(certDir, 'preview-key.pem');
const certPath = path.join(certDir, 'preview-cert.pem');
const metaPath = path.join(certDir, 'meta.json');

const candidates = getNetworkCandidates();
const ip = pickPreferredIp(candidates);
let needsRegenerate = true;

if (fs.existsSync(metaPath) && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    needsRegenerate = meta.ip !== ip;
  } catch {
    needsRegenerate = true;
  }
}

if (needsRegenerate) {
  fs.mkdirSync(certDir, { recursive: true });

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ];

  for (const candidate of candidates) {
    if (!altNames.some((entry) => entry.type === 7 && entry.ip === candidate.ip)) {
      altNames.push({ type: 7, ip: candidate.ip });
    }
  }

  const pems = selfsigned.generate([{ name: 'commonName', value: ip }], {
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: 'basicConstraints',
        cA: false,
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames,
      },
    ],
  });

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ip,
        candidates: candidates.map(({ ip: address, name, virtual, hotspot }) => ({
          ip: address,
          name,
          virtual,
          hotspot,
        })),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`Generated preview certificate for ${ip}`);
} else {
  console.log(`Using existing preview certificate for ${ip}`);
}

printIphoneUrlHelp(4173);
