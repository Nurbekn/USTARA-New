'use strict';
// Vendored offline QR encoder: qrcode-terminal's QRCode library (Kazuhiko Arase MIT,
// qrcode-terminal distribution Apache-2.0). See backend/vendor/qrcode-terminal/LICENSE.
const QRCode = require('../vendor/qrcode-terminal/QRCode');
const ECC = require('../vendor/qrcode-terminal/QRCode/QRErrorCorrectLevel');
function qrSvg(text) {
  if(typeof text!=='string'||text.length>600||!/^https?:\/\//.test(text))throw new Error('invalid qr url');
  const code=new QRCode(-1,ECC.M);code.addData(text);code.make();
  const n=code.getModuleCount();const rects=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(code.isDark(y,x))rects.push(`M${x+4} ${y+4}h1v1h-1z`);
  const size=n+8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="320" height="320" role="img" aria-label="Navbatga kirish QR kodi"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#111827" d="${rects.join('')}"/></svg>`;
}
module.exports={qrSvg};
