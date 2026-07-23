import assert from "node:assert/strict";
import test from "node:test";
import {
  clientOperationNames,
  extendGeneratedClientSource,
  extendOpenApiDocument,
  requestBodyNames,
} from "./apply-integration-network-extension.mjs";

const requestBody = () => ({
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          attributes: { type: "object" },
        },
        additionalProperties: false,
      },
    },
  },
});

test("patches both real deploy and dry-run operation families", () => {
  assert.deepEqual(requestBodyNames, [
    "createIntegrationBody",
    "updateIntegrationBody",
    "validateIntegrationCreationBody",
    "validateIntegrationUpdateBody",
  ]);
  assert.deepEqual(clientOperationNames, [
    "CreateIntegration",
    "UpdateIntegration",
    "ValidateIntegrationCreation",
    "ValidateIntegrationUpdate",
  ]);
});

test("extends classic deploy and dry-run request schemas with network policy", () => {
  const document = {
    components: {
      requestBodies: {
        createIntegrationBody: requestBody(),
        updateIntegrationBody: requestBody(),
        validateIntegrationCreationBody: requestBody(),
        validateIntegrationUpdateBody: requestBody(),
      },
    },
  };
  for (const bodyName of [
    "updateIntegrationBody",
    "validateIntegrationUpdateBody",
  ]) {
    document.components.requestBodies[bodyName].content[
      "application/json"
    ].schema.properties.maxExecutionTime = { type: "integer" };
  }

  extendOpenApiDocument(document);

  for (const bodyName of [
    "createIntegrationBody",
    "updateIntegrationBody",
    "validateIntegrationCreationBody",
    "validateIntegrationUpdateBody",
  ]) {
    const properties =
      document.components.requestBodies[bodyName].content["application/json"]
        .schema.properties;
    assert.deepEqual(properties.providerHosts.items, { type: "string" });
    assert.equal(properties.ingressRelayed.type, "boolean");
    assert.deepEqual(properties.webhookAuthMode.enum, [
      "shared_secret",
      "provider_verified",
      "handler_verified",
    ]);
    assert.equal(properties.maxExecutionTime.type, "integer");
    assert.equal(properties.maxExecutionTime.minimum, 1);
    assert.equal(properties.maxExecutionTime.maximum, 119);
    assert.equal(properties.maxConcurrency.type, "integer");
    assert.equal(properties.maxConcurrency.minimum, 1);
    assert.equal(properties.maxConcurrency.maximum, 4);
  }

  const extendedOnce = structuredClone(document);
  extendOpenApiDocument(document);
  assert.deepEqual(document, extendedOnce);
});

test("is idempotent and leaves unrelated documents unchanged", () => {
  const document = { components: { requestBodies: {} } };

  assert.equal(extendOpenApiDocument(document), document);
  assert.deepEqual(document, { components: { requestBodies: {} } });
});

test("extends generated classic deploy and dry-run request types and serializers", () => {
  const sourceFor = (operationName) => `export interface ${operationName}RequestBody {
  attributes?: Record<string, string>;
}

export type ${operationName}Input = ${operationName}RequestBody

export const parseReq = (input: ${operationName}Input) => ({
  body: { 'name': input['name'], 'attributes': input['attributes'] },
})
`;

  for (const operationName of [
    "CreateIntegration",
    "UpdateIntegration",
    "ValidateIntegrationCreation",
    "ValidateIntegrationUpdate",
  ]) {
    const extended = extendGeneratedClientSource(
      sourceFor(operationName),
      operationName,
    );

    assert.match(extended, /providerHosts\?: string\[\];/);
    assert.match(extended, /maxExecutionTime\?: number;/);
    assert.match(extended, /maxConcurrency\?: number;/);
    assert.match(extended, /ingressRelayed\?: boolean;/);
    assert.match(
      extended,
      /webhookAuthMode\?: "shared_secret" \| "provider_verified" \| "handler_verified";/,
    );
    assert.match(extended, /'providerHosts': input\['providerHosts'\]/);
    assert.match(extended, /'maxExecutionTime': input\['maxExecutionTime'\]/);
    assert.match(extended, /'maxConcurrency': input\['maxConcurrency'\]/);
    assert.match(extended, /'ingressRelayed': input\['ingressRelayed'\]/);
    assert.match(extended, /'webhookAuthMode': input\['webhookAuthMode'\]/);
    assert.equal(
      extendGeneratedClientSource(extended, operationName),
      extended,
    );
  }
});
