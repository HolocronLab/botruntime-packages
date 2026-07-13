import { IntegrationDefinition } from "@holocronlab/botruntime-sdk";
import { describe, expect, test } from "vitest";
import type { Integration } from "@holocronlab/botruntime-client";
import {
  prepareCreateIntegrationBody,
  prepareUpdateIntegrationBody,
} from "./integration-body";

describe("integration deployment bodies", () => {
  test("preserves the platform network contract on the classic deploy path", async () => {
    const integration = new IntegrationDefinition({
      name: "yookassa",
      version: "1.0.0",
      network: {
        providerHosts: ["api.yookassa.ru"],
        ingressRelayed: true,
        webhookAuthMode: "provider_verified",
      },
    });

    const body = await prepareCreateIntegrationBody(integration);

    expect(body).toMatchObject({
      providerHosts: ["api.yookassa.ru"],
      ingressRelayed: true,
      webhookAuthMode: "provider_verified",
    });
  });

  test("preserves the platform network contract when classic deploy updates an integration", () => {
    const body = prepareUpdateIntegrationBody(
      {
        id: "integration-id",
        providerHosts: ["api.yookassa.ru"],
        ingressRelayed: true,
        webhookAuthMode: "provider_verified",
      },
      {
        actions: {},
        events: {},
        states: {},
        entities: {},
        user: { tags: {} },
        channels: {},
        interfaces: {},
        configurations: {},
        attributes: {},
        configuration: { identifier: {} },
        identifier: {},
      } as unknown as Integration,
    );

    expect(body).toMatchObject({
      providerHosts: ["api.yookassa.ru"],
      ingressRelayed: true,
      webhookAuthMode: "provider_verified",
    });
  });

  test("serializes secure network defaults so redeploy can clear stale policy", async () => {
    const body = await prepareCreateIntegrationBody(
      new IntegrationDefinition({ name: "plain", version: "1.0.0" }),
    );

    expect(body).toMatchObject({
      providerHosts: [],
      ingressRelayed: false,
      webhookAuthMode: "shared_secret",
    });
  });
});
