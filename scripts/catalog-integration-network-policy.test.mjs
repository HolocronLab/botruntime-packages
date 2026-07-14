import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedPolicies = [
  {
    integration: "telegram",
    host: "api.telegram.org",
    ingressRelayed: true,
    webhookAuthMode: "shared_secret",
  },
  {
    integration: "megaplan",
    host: "*.megaplan.ru",
    ingressRelayed: false,
    webhookAuthMode: "shared_secret",
  },
  {
    integration: "yadisk",
    host: "cloud-api.yandex.net",
    ingressRelayed: false,
    webhookAuthMode: "shared_secret",
  },
];

for (const { integration, host, ingressRelayed, webhookAuthMode } of expectedPolicies) {
  test(`${integration} declares its production network policy`, () => {
    const source = readFileSync(
      new URL(`../integrations/${integration}/integration.definition.ts`, import.meta.url),
      "utf8",
    );
    const network = source.match(/\bnetwork:\s*\{(?<body>[\s\S]*?)\n\s*\},/u)?.groups?.body;

    assert.ok(network, `${integration} must declare network in its integration definition`);
    assert.match(network, new RegExp(`providerHosts:\\s*\\[\\s*['\"]${host.replaceAll(".", "\\.").replace("*", "\\*")}['\"]\\s*\\]`));
    assert.match(network, new RegExp(`ingressRelayed:\\s*${ingressRelayed}`));
    assert.match(network, new RegExp(`webhookAuthMode:\\s*['\"]${webhookAuthMode}['\"]`));
  });
}
