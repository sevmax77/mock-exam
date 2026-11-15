import os from 'node:os';

const VIRTUAL_IP_PREFIXES = [
  '169.254.',
  '192.168.56.',
  '192.168.57.',
  '192.168.122.',
  '172.17.',
  '172.18.',
];

const HOTSPOT_IP_PREFIXES = ['172.20.10.'];

export function isLikelyVirtualIp(ip) {
  return VIRTUAL_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

export function isLikelyHotspotIp(ip) {
  return HOTSPOT_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

export function getNetworkCandidates() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(nets)) {
    for (const net of addresses ?? []) {
      if (net.family !== 'IPv4' || net.internal) {
        continue;
      }

      candidates.push({
        ip: net.address,
        name,
        virtual: isLikelyVirtualIp(net.address),
        hotspot: isLikelyHotspotIp(net.address),
      });
    }
  }

  return candidates;
}

export function pickPreferredIp(candidates) {
  const usable = candidates.filter((candidate) => !candidate.virtual && !candidate.hotspot);
  const preferred =
    usable.find((candidate) => candidate.ip.startsWith('192.168.')) ??
    usable.find((candidate) => candidate.ip.startsWith('10.')) ??
    usable.find((candidate) => candidate.ip.startsWith('172.')) ??
    candidates.find((candidate) => candidate.hotspot && !candidate.virtual) ??
    usable[0] ??
    candidates.find((candidate) => !candidate.virtual) ??
    candidates[0];

  return preferred?.ip ?? '127.0.0.1';
}

export function describeCandidate(candidate) {
  if (candidate.virtual) {
    return 'virtual adapter (for example VirtualBox) — iPhone cannot reach this';
  }

  if (candidate.hotspot) {
    return 'likely iPhone hotspot/USB tether — use only if this PC is connected through the iPhone';
  }

  return candidate.name;
}

export function printIphoneUrlHelp(port = 4173) {
  const candidates = getNetworkCandidates();
  const preferredIp = pickPreferredIp(candidates);

  console.log('');
  console.log('iPhone URL guide');
  console.log('================');
  console.log(`Use this URL on iPhone Safari when both devices share the same network:`);
  console.log(`  https://${preferredIp}:${port}`);
  console.log('');
  console.log('All addresses Vite may show:');

  for (const candidate of candidates) {
    const marker =
      candidate.ip === preferredIp
        ? 'recommended'
        : candidate.virtual
          ? 'do not use'
          : candidate.hotspot
            ? 'hotspot only'
            : 'alternate';
    console.log(
      `  https://${candidate.ip}:${port}  [${marker}] ${describeCandidate(candidate)}`,
    );
  }

  console.log('');
  console.log('Notes:');
  console.log('- 192.168.56.x is usually VirtualBox, not home Wi-Fi.');
  console.log('- 172.20.10.x is a normal private IP range, often used by iPhone hotspot.');
  console.log('- For home Wi-Fi, iPhone and Windows must use the same network.');
  console.log('- If needed, run "ipconfig" on Windows and use the Wi-Fi adapter IPv4 address.');
  console.log('');
}
