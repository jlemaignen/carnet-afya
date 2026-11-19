// Copie dans public/lib les bibliothèques chargées à la demande par le carnet (QR code, PDF),
// depuis leurs paquets npm officiels : aucune ressource n'est chargée depuis un service tiers.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/lib', { recursive: true });
for (const [from, to] of [
  ['node_modules/html2canvas/dist/html2canvas.min.js', 'public/lib/html2canvas.min.js'],
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'public/lib/jspdf.umd.min.js'],
  ['node_modules/qrcode-generator/qrcode.js', 'public/lib/qrcode.min.js'],
]) copyFileSync(from, to);
console.log('public/lib à jour');
