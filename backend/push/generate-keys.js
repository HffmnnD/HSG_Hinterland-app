// Erzeugt das VAPID-Schlüsselpaar für Web Push:  npm run push:keys
//
// Die Ausgabe in backend/.env übernehmen. Den privaten Schlüssel nie ins
// Repository legen. Wechselt das Paar, müssen alle Geräte Push neu einschalten.
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:admin@hsg-hinterland.de');
