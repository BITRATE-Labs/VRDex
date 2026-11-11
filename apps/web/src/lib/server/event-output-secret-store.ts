import { SecretsManagerClient, type SecretsManagerClientConfig } from "@aws-sdk/client-secrets-manager";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

/** Explicit storage region: Vercel's AWS_REGION identifies the function's region. */
export function eventOutputSecretClientOptions(
  env: NodeJS.ProcessEnv = process.env,
  oidcProvider: typeof awsCredentialsProvider = awsCredentialsProvider,
): SecretsManagerClientConfig {
  const region = env.VRDEX_EVENT_OUTPUT_SECRET_REGION?.trim();
  const roleArn = env.VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN?.trim();
  if (!region || !/^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/.test(region)) {
    throw new Error("Broadcast connection storage is not configured.");
  }
  if (roleArn && !/^arn:aws(?:-us-gov|-cn)?:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]{1,512}$/.test(roleArn)) {
    throw new Error("Broadcast connection storage is not configured.");
  }
  if (env.VERCEL && !roleArn) {
    throw new Error("Broadcast connection storage is not configured.");
  }
  return {
    region,
    ...(roleArn ? { credentials: oidcProvider({ roleArn }) } : {}),
  };
}

/** Hosted deployments use short-lived Vercel OIDC credentials, never static keys. */
export function eventOutputSecretsClient(): SecretsManagerClient {
  return new SecretsManagerClient(eventOutputSecretClientOptions());
}
