#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const requestBodyNames = [
  "createIntegrationBody",
  "updateIntegrationBody",
  "validateIntegrationCreationBody",
  "validateIntegrationUpdateBody",
];

export const clientOperationNames = [
  "CreateIntegration",
  "UpdateIntegration",
  "ValidateIntegrationCreation",
  "ValidateIntegrationUpdate",
];

const networkProperties = {
  providerHosts: {
    type: "array",
    items: { type: "string" },
    description: "Outbound host allowlist declared by the integration.",
  },
  ingressRelayed: {
    type: "boolean",
    description:
      "Whether inbound webhook traffic is relayed through the platform.",
  },
  webhookAuthMode: {
    type: "string",
    enum: ["shared_secret", "provider_verified", "handler_verified"],
    description: "Authentication mode enforced for inbound webhooks.",
  },
};

function appendProperties(properties, additions) {
  const extended = { ...properties };
  for (const [name, schema] of Object.entries(additions)) {
    extended[name] ??= structuredClone(schema);
  }
  return extended;
}

export function extendOpenApiDocument(document) {
  const requestBodies = document?.components?.requestBodies;
  for (const bodyName of requestBodyNames) {
    const schema =
      requestBodies?.[bodyName]?.content?.["application/json"]?.schema;
    if (schema?.properties) {
      schema.properties = appendProperties(
        schema.properties,
        networkProperties,
      );
    }
  }
  return document;
}

const requestTypeFields = `  /**
   * Outbound host allowlist declared by the integration.
   */
  providerHosts?: string[];
  /**
   * Whether inbound webhook traffic is relayed through the platform.
   */
  ingressRelayed?: boolean;
  /**
   * Authentication mode enforced for inbound webhooks.
   */
  webhookAuthMode?: "shared_secret" | "provider_verified" | "handler_verified";
`;

export function extendGeneratedClientSource(source, operationName) {
  let output = source;
  if (
    !output.includes(
      'webhookAuthMode?: "shared_secret" | "provider_verified" | "handler_verified";',
    )
  ) {
    output = output.replace(
      'webhookAuthMode?: "shared_secret" | "provider_verified";',
      'webhookAuthMode?: "shared_secret" | "provider_verified" | "handler_verified";',
    );
  }

  if (!output.includes("webhookAuthMode?:")) {
    const inputMarker = `\n}\n\nexport type ${operationName}Input`;
    if (!output.includes(inputMarker)) {
      throw new Error(`failed to find ${operationName} request body boundary`);
    }
    output = output.replace(
      inputMarker,
      `\n${requestTypeFields}}\n\nexport type ${operationName}Input`,
    );
  }

  if (!output.includes("'webhookAuthMode': input['webhookAuthMode']")) {
    const serializerPattern = /(\n\s*body: \{[^\n]*)( \},)/;
    if (!serializerPattern.test(output)) {
      throw new Error(
        `failed to find ${operationName} request serializer boundary`,
      );
    }
    output = output.replace(
      serializerPattern,
      "$1, 'providerHosts': input['providerHosts'], 'ingressRelayed': input['ingressRelayed'], 'webhookAuthMode': input['webhookAuthMode']$2",
    );
  }

  return output;
}

function patchOpenApiFiles() {
  const directory = join(root, "packages/botruntime-api/openapi");
  let found = 0;
  for (const file of readdirSync(directory).filter((name) =>
    name.endsWith(".json"),
  )) {
    const path = join(directory, file);
    const document = JSON.parse(readFileSync(path, "utf8"));
    for (const bodyName of requestBodyNames) {
      if (document?.components?.requestBodies?.[bodyName]) found++;
    }
    extendOpenApiDocument(document);
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  }
  if (found === 0)
    throw new Error("no integration request schemas found to extend");
}

function patchClientFiles() {
  for (const section of ["public", "admin"]) {
    for (const operationName of clientOperationNames) {
      const filename = `${operationName.charAt(0).toLowerCase()}${operationName.slice(1)}.ts`;
      const path = join(
        root,
        "packages/botruntime-client/src/gen",
        section,
        "operations",
        filename,
      );
      if (!existsSync(path)) continue;
      const source = readFileSync(path, "utf8");
      const extended = extendGeneratedClientSource(source, operationName);
      writeFileSync(path, extended);
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const mode = process.argv[2];
  if (mode !== "--client-only") patchOpenApiFiles();
  if (mode !== "--openapi-only") patchClientFiles();
  const target =
    mode === "--openapi-only"
      ? "request schemas"
      : mode === "--client-only"
        ? "generated clients"
        : "schemas and clients";
  console.log(
    `[integration-network-extension] extended classic integration ${target}`,
  );
}
