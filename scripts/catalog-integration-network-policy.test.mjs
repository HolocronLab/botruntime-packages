import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedPolicies = [
  {
    integration: "telegram",
    hosts: ["api.telegram.org"],
    ingressRelayed: true,
    webhookAuthMode: "shared_secret",
    sdkSpec: "^6.13.3",
  },
  {
    integration: "megaplan",
    hosts: ["*.megaplan.ru"],
    ingressRelayed: false,
    webhookAuthMode: "shared_secret",
    sdkSpec: "6.13.3",
  },
  {
    integration: "yadisk",
    hosts: ["cloud-api.yandex.net", "*.disk.yandex.net", "*.disk.yandex.ru"],
    ingressRelayed: false,
    webhookAuthMode: "shared_secret",
    sdkSpec: "^6.13.3",
  },
];

for (const { integration, hosts, ingressRelayed, webhookAuthMode, sdkSpec } of expectedPolicies) {
  test(`${integration} declares its production network policy`, () => {
    const source = readFileSync(
      new URL(`../integrations/${integration}/integration.definition.ts`, import.meta.url),
      "utf8",
    );
    const network = source.match(/\bnetwork:\s*\{(?<body>[\s\S]*?)\n\s*\},/u)?.groups?.body;

    assert.ok(network, `${integration} must declare network in its integration definition`);
    for (const host of hosts) {
      assert.match(network, new RegExp(`['\"]${host.replaceAll(".", "\\.").replace("*", "\\*")}['\"]`));
    }
    assert.match(network, new RegExp(`ingressRelayed:\\s*${ingressRelayed}`));
    assert.match(network, new RegExp(`webhookAuthMode:\\s*['\"]${webhookAuthMode}['\"]`));

    const packageJson = JSON.parse(
      readFileSync(new URL(`../integrations/${integration}/package.json`, import.meta.url), "utf8"),
    );
    assert.equal(packageJson.dependencies["@holocronlab/botruntime-sdk"], sdkSpec);
    const lock = readFileSync(new URL(`../integrations/${integration}/bun.lock`, import.meta.url), "utf8");
    assert.match(lock, /@holocronlab\/botruntime-sdk@6\.13\.3/);
  });
}
