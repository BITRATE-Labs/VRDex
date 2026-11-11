import { createHash } from 'node:crypto';
import { CreateSecretCommand, DescribeSecretCommand, DeleteSecretCommand } from '@aws-sdk/client-secrets-manager';
/** Browser input never selects a secret name or ARN. A user-bound Convex grant does. */
export async function provisionConnection({ input, prepare, commit, abandon, secrets, brokerToken }) {
  if (!brokerToken || brokerToken.length < 32) throw Error('Connection service unavailable.');
  if (!input || typeof input !== 'object' || Object.keys(input).some(k => !['currentSlug', 'provider', 'serverUrl', 'streamKey', 'playbackUrl', 'expectedRevision', 'requestId', 'permissionsAccepted'].includes(k))) throw Error('Invalid connection request.');
  const streamKey = input.streamKey?.trim();
  if (streamKey !== undefined && streamKey !== '' && !/^[a-zA-Z0-9_-]{1,512}$/.test(streamKey)) throw Error('Enter a valid stream key.');
  const { streamKey: _, ...metadata } = input;
  const grant = await prepare({ ...metadata, replaceKey: !!streamKey, credentialDigest: streamKey ? createHash("sha256").update(streamKey).digest("hex") : "" });
  if (grant.connection) return { connection: grant.connection };
  let arn = grant.credentialRef;
  if (streamKey) {
    try { const created = await secrets.send(new CreateSecretCommand({ Name: grant.secretName, ClientRequestToken: input.requestId, SecretString: JSON.stringify({ rtmpUrl: input.serverUrl, streamKey }), Tags: [{ Key: 'Project', Value: 'VRDex' }, { Key: 'Purpose', Value: 'broadcast-output' }] })); arn = created.ARN; } catch (error) { if (error?.name !== "ResourceExistsException") throw Error('Could not save the connection. Try again.'); try { arn = (await secrets.send(new DescribeSecretCommand({ SecretId: grant.secretName }))).ARN; } catch { throw Error('Could not save the connection. Try again.'); } }
  }
  if (!arn) throw Error('Enter a stream key for this connection.');
  try { return await commit({ grantId: grant.grantId, credentialRef: arn, brokerToken }); }
  catch (error) {
    // A lost response may hide a committed binding. Replaying the same grant is
    // authoritative; never delete a possibly referenced secret after uncertainty.
    try { return await commit({ grantId: grant.grantId, credentialRef: arn, brokerToken }); } catch { }
    let abandoned = false;
    if (streamKey && abandon) { try { abandoned = (await abandon({ grantId: grant.grantId, brokerToken })).canDelete; if (abandoned) await secrets.send(new DeleteSecretCommand({ SecretId: arn, RecoveryWindowInDays: 7 })); } catch { } }
    if (abandoned) throw Error('Connection request expired.');
    throw Error('Could not save the connection. Reload and try again.');
  }
}
