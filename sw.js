// Service Worker für Bully: hält App und Daten vor, damit die App in der Halle ohne Empfang aufgeht.
// Liegt im Wurzelverzeichnis, weil der Geltungsbereich eines Service Workers auf das Verzeichnis seiner Datei
// begrenzt ist: die Seite unter app/ lädt ihre Daten aus daten/, beide müssen im Geltungsbereich liegen.
// Registriert wird er am Ende von app/app.js (nur per http/https, nicht von file://).
//
// Strategie: Netz zuerst, Cache als Rückfall, für alles vom eigenen Ursprung.
//   Online kommt so immer ein zusammenpassender Stand aller Dateien (kein Mix aus alter index.html und neuem app.js),
//   offline der zuletzt gesehene. Fremde Ursprünge (Teamlogos von saisonmanager.de) werden nicht angefasst.
// Cache-Schlüssel sind die URLs ohne ?v= und ?t=, so finden sich die Dateien auch nach einem Versionswechsel.

const CACHE = 'bully-1'; // hochzählen, wenn sich die Liste unten ändert; alte Caches werden beim Aktivieren gelöscht
const SHELL = [
  'index.html',
  'app/index.html',
  'app/adapter.js',
  'app/app.js',
  'app/modell.js',
  'app/spieler.js',
  'app/kennzahlen.js',
  'app/matchplan.js',
  'app/ergebnisbild.js',
  'app/assets/fonts/oswald-500.woff',
  'app/assets/fonts/oswald-700.woff',
  'app/assets/fonts/lato-bold.woff',
  'app/assets/fonts/lato-black.woff',
  'app/manifest.json',
  'app/assets/favicon.svg',
  'app/assets/icon-180.png',
  'app/assets/icon-512.png',
  'app/assets/keyvisual.jpg',
];

// Schlüssel im Cache: gleiche URL ohne Suchteil; Verzeichnisse zeigen auf ihre index.html.
function schluessel(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Eine einzelne fehlende Datei blockiert die Installation nicht; der Rest kommt beim ersten Aufruf in den Cache.
      .then(c => Promise.all(SHELL.map(p => fetch(p).then(r => { if (r.ok) return c.put(schluessel(r.url), r); }).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = schluessel(req.url);
  e.respondWith(caches.open(CACHE).then(c =>
    fetch(req, { cache: 'no-cache' }) // beim Server nachfragen statt bis zu 10 Minuten alte Kopien aus dem Browser-Cache
      .then(r => { if (r.ok) c.put(key, r.clone()); return r; })
      .catch(() => c.match(key).then(r => r || Promise.reject(new Error('offline'))))
  ));
});
