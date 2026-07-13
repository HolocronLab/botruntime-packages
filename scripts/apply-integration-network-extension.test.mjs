import assert from "node:assert/strict";
import test from "node:test";
import {
  extendGeneratedClientSource,
  extendOpenApiDocument,
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

test("extends classic integration create and update request schemas with network policy", () => {
  const document = {
    components: {
      requestBodies: {
        createIntegrationBody: requestBody(),
        updateIntegrationBody: requestBody(),
      },
    },
  };

  extendOpenApiDocument(document);

  for (const bodyName of ["createIntegrationBody", "updateIntegrationBody"]) {
    const properties =
      document.components.requestBodies[bodyName].content["application/json"]
        .schema.properties;
    assert.deepEqual(properties.providerHosts.items, { type: "string" });
    assert.equal(properties.ingressRelayed.type, "boolean");
    assert.deepEqual(properties.webhookAuthMode.enum, [
      "shared_secret",
      "provider_verified",
    ]);
  }
});

test("is idempotent and leaves unrelated documents unchanged", () => {
  const document = { components: { requestBodies: {} } };

  assert.equal(extendOpenApiDocument(document), document);
  assert.deepEqual(document, { components: { requestBodies: {} } });
});

test("extends generated classic deploy request types and serializers", () => {
  const source = `export interface CreateIntegrationRequestBody {
  attributes?: Record<string, string>;
}

export type CreateIntegrationInput = CreateIntegrationRequestBody

export const parseReq = (input: CreateIntegrationInput) => ({
  body: { 'name': input['name'], 'attributes': input['attributes'] },
})
`;

  const extended = extendGeneratedClientSource(source, "CreateIntegration");

  assert.match(extended, /providerHosts\?: string\[\];/);
  assert.match(extended, /ingressRelayed\?: boolean;/);
  assert.match(
    extended,
    /webhookAuthMode\?: "shared_secret" \| "provider_verified";/,
  );
  assert.match(extended, /'providerHosts': input\['providerHosts'\]/);
  assert.match(extended, /'ingressRelayed': input\['ingressRelayed'\]/);
  assert.match(extended, /'webhookAuthMode': input\['webhookAuthMode'\]/);
});
