import assert from "node:assert/strict";
import { it } from "node:test";
import { eventOutputSecretClientOptions } from "../../apps/web/src/lib/server/event-output-secret-store";

const region = "us-east-1";
const roleArn = "arn:aws:iam::079358094174:role/vrdex-vercel-broadcast-output";

it("hosted broadcast provisioning selects the dedicated OIDC role and explicit secret region", () => {
  let requestedRole: string | undefined;
  const credentials = async () => ({ accessKeyId: "synthetic", secretAccessKey: "synthetic" });
  const options = eventOutputSecretClientOptions({
    VERCEL: "1", AWS_REGION: "iad1", VRDEX_EVENT_OUTPUT_SECRET_REGION: region,
    VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN: roleArn,
  }, (input) => { requestedRole = input.roleArn; return credentials; });
  assert.equal(requestedRole, roleArn);
  assert.equal(options.region, region);
  assert.equal(options.credentials, credentials);
});

it("hosted provisioning fails closed without the explicit role or region", () => {
  for (const env of [
    { VERCEL: "1", AWS_REGION: region, VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN: roleArn },
    { VERCEL: "1", AWS_REGION: region, VRDEX_EVENT_OUTPUT_SECRET_REGION: region },
    { VERCEL: "1", VRDEX_EVENT_OUTPUT_SECRET_REGION: region, VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN: "bad-role" },
  ]) assert.throws(() => eventOutputSecretClientOptions(env), /not configured/);
});

it("self-hosted provisioning supports the ambient workload role with an explicit secret region", () => {
  const options = eventOutputSecretClientOptions({ VRDEX_EVENT_OUTPUT_SECRET_REGION: region });
  assert.equal(options.region, region);
  assert.equal(options.credentials, undefined);
});
