// ホーム画面に追加できるようにするための最小限のサービスワーカー。
// 記録は常に最新を表示したいので、キャッシュはせずそのまま通信します。
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function () { /* そのままネットワークへ */ });
