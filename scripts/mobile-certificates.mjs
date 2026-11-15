import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';

function runOpenSSL(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Het lokale ontwikkelcertificaat kon niet worden gemaakt. Controleer of OpenSSL beschikbaar is.');
}

export function ensureMobileCertificates(directory, addresses) {
  mkdirSync(directory, { recursive: true });
  const executable = process.env.RHYTHM_OPENSSL || (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  const rootKey = path.join(directory, 'rootCA-key.pem');
  const root = path.join(directory, 'rootCA.pem');
  const publicRoot = path.join(directory, 'rhythm-dev-ca.cer');
  const key = path.join(directory, 'rhythm-key.pem');
  const cert = path.join(directory, 'rhythm.pem');
  const hosts = [...new Set(['127.0.0.1', '::1', ...addresses])];
  if (!existsSync(root) || !existsSync(rootKey)) {
    runOpenSSL(executable, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365', '-subj', '/CN=Rhythm Local Development CA', '-keyout', rootKey, '-out', root, '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-addext', 'subjectKeyIdentifier=hash']);
  }
  runOpenSSL(executable, ['x509', '-in', root, '-outform', 'DER', '-out', publicRoot]);
  let valid = false;
  if (existsSync(cert) && existsSync(key)) {
    try {
      const existing = new X509Certificate(readFileSync(cert));
      valid = existing.checkHost('localhost') === 'localhost' && hosts.every(host => Boolean(existing.checkIP(host))) && Date.parse(existing.validTo) > Date.now() + 86400000;
    } catch { /* Regenerate only the leaf certificate; preserve the phone's trusted CA. */ }
  }
  if (!valid) {
    const request = path.join(directory, 'rhythm.csr');
    const extensions = path.join(directory, 'rhythm-extensions.cnf');
    writeFileSync(extensions, `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,${hosts.map(host => `IP:${host}`).join(',')}\n`);
    runOpenSSL(executable, ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=Rhythm Local Development', '-keyout', key, '-out', request]);
    runOpenSSL(executable, ['x509', '-req', '-in', request, '-CA', root, '-CAkey', rootKey, '-CAcreateserial', '-days', '90', '-sha256', '-extfile', extensions, '-out', cert]);
  }
  return { key: readFileSync(key), cert: readFileSync(cert), root: readFileSync(root), publicRoot: readFileSync(publicRoot) };
}
