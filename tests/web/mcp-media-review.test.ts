import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { fetchProfileAssetSourceUrl } from "../../apps/web/src/lib/server/profile-asset-source-import";
import { describe, it } from "node:test";

import {
  createMcpMediaReviewHandlers,
  type MediaReviewDependencies,
} from "../../apps/web/src/lib/server/mcp-media-review";

const version = "a".repeat(64);
it("current preview checks the selected snapshot before fetch and blocks private redirects without fetching donor URLs", async () => {
  for (const changed of [false, true]) {
    const fetched: string[] = [];
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        query: async (name) =>
          name === "current"
            ? {
                profileDisplayName: "Fixture",
                reviewVersion: changed ? "changed" : version,
                sourceKind: "legacy",
                sourceUrl: "https://current.example/image",
              }
            : detail({
                currentImage: {
                  kind: "legacy",
                  url: "https://current.example/image",
                },
              }),
        readRemoteImage: async ({ sourceUrl }) => {
          const result = await fetchProfileAssetSourceUrl(sourceUrl, {
            resolveHostname: async () => [{ address: "93.184.216.34" }],
            requestPinnedSource: async (url) => {
              fetched.push(url.toString());
              const response = Readable.from([]) as IncomingMessage;
              response.statusCode = 302;
              response.headers = { location: "https://127.0.0.1/private" };
              return response;
            },
          });
          return { body: result.body, contentType: result.mimeType };
        },
      }),
    );
    const result = await handlers.preview({
      submissionId: "submission-1",
      expectedReviewVersion: version,
      target: "current",
    });
    assert.equal(result.isError, true);
    assert.deepEqual(fetched, changed ? [] : ["https://current.example/image"]);
    assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|private/);
  }
});
const candidate = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function detail(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: "submission-1",
    profileId: "profile-1",
    profileSlug: "fixture",
    profileDisplayName: "Fixture",
    profileIsPublic: true,
    profileType: "person",
    requestedPlacement: "profile_image",
    status: "submitted",
    sourceUrl: "https://source.example/image.png",
    credit: "Fixture creator",
    expiresAt: Date.now() + 60_000,
    targetProfileUpdatedAt: 1,
    currentProfileUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    priorProposalCount: 0,
    priorProposalCountTruncated: false,
    canViewCandidate: true,
    canSuppress: false,
    reviewVersion: version,
    currentPlacement: null,
    currentAvatarImageUrl: null,
    currentAutomaticImageUrl: null,
    candidate: {
      rendition: { submissionId: "submission-1", kind: "stored_candidate" },
      sourceUrl: "https://source.example/image.png",
      credit: "Fixture creator",
      contentSha256:
        "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460",
    },
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<MediaReviewDependencies> = {},
): MediaReviewDependencies {
  return {
    actorUserId: "user-1",
    now: () => 2_000,
    verifyContributorEmail: async () => true,
    query: async (name) => {
      if (name === "list")
        return { page: [detail()], continueCursor: "next", isDone: false };
      if (name === "candidate") {
        return {
          storageKey: "private/candidate.png",
          mimeType: "image/png",
          profileDisplayName: "Fixture",
        };
      }
      return detail();
    },
    mutate: async () => ({
      operationId: "operation-1",
      operationState: "committed",
      resourceId: "submission-1",
    }),
    readStoredObject: async () => ({
      body: candidate,
      contentType: "image/png",
      contentLength: candidate.byteLength,
    }),
    ...overrides,
  };
}

describe("MCP media review handlers", () => {
  it("reauthorizes protected reads and never trusts verification input", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let verifications = 0;
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        verifyContributorEmail: async () => {
          verifications += 1;
          return true;
        },
        query: async (name, args) => {
          calls.push({ name, args });
          return name === "candidate"
            ? {
                storageKey: "private/candidate.png",
                mimeType: "image/png",
                profileDisplayName: "Fixture",
              }
            : detail();
        },
      }),
    );

    await handlers.get({ submissionId: "submission-1" });
    await handlers.preview({
      submissionId: "submission-1",
      expectedReviewVersion: version,
    });

    assert.equal(verifications, 2);
    assert.equal(
      calls.every(
        ({ args }) =>
          args.emailVerified === true &&
          args.emailVerificationAttestedAt === 2_000,
      ),
      true,
    );
    assert.equal(
      calls.every(
        ({ args }) => !("actorUserId" in args) || args.actorUserId === "user-1",
      ),
      true,
    );
  });

  it("returns native bounded image content tied to the requested review version", async () => {
    const handlers = createMcpMediaReviewHandlers(dependencies());
    const result = await handlers.preview({
      submissionId: "submission-1",
      expectedReviewVersion: version,
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.content[0]?.type, "image");
    assert.equal(
      result.content[0]?.type === "image" ? result.content[0].mimeType : null,
      "image/png",
    );
    assert.deepEqual(result.structuredContent, {
      submissionId: "submission-1",
      reviewVersion: version,
      profileDisplayName: "Fixture",
      mimeType: "image/png",
      byteLength:
        result.content[0]?.type === "image"
          ? Buffer.from(result.content[0].data, "base64").byteLength
          : 0,
    });
  });

  it("refuses a stale preview without reading stored bytes", async () => {
    let reads = 0;
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        readStoredObject: async () => {
          reads += 1;
          return null;
        },
      }),
    );
    const result = await handlers.preview({
      submissionId: "submission-1",
      expectedReviewVersion: "b".repeat(64),
    });

    assert.equal(result.isError, true);
    assert.equal(reads, 0);
    assert.match(
      result.content[0]?.type === "text" ? result.content[0].text : "",
      /changed/i,
    );
  });

  it("does not read stored bytes when detail or preview authority is denied", async () => {
    let reads = 0;
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        query: async () => {
          throw new Error("MEDIA_REVIEW_ACCESS_REQUIRED");
        },
        readStoredObject: async () => {
          reads += 1;
          return null;
        },
      }),
    );

    await assert.rejects(
      handlers.get({ submissionId: "submission-1" }),
      /MEDIA_REVIEW_ACCESS_REQUIRED/,
    );
    await assert.rejects(
      handlers.preview({
        submissionId: "submission-1",
        expectedReviewVersion: version,
      }),
      /MEDIA_REVIEW_ACCESS_REQUIRED/,
    );
    assert.equal(reads, 0);
  });

  it("does not emit bytes when the stored content hash differs from inspected detail", async () => {
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        readStoredObject: async () => ({
          body: new Uint8Array([1, 2, 3]),
          contentType: "image/png",
          contentLength: 3,
        }),
      }),
    );
    const result = await handlers.preview({
      submissionId: "submission-1",
      expectedReviewVersion: version,
    });

    assert.equal(result.isError, true);
    assert.equal(
      result.content.some((item) => item.type === "image"),
      false,
    );
  });

  it("passes durable decision keys through unchanged on replay", async () => {
    const mutations: Record<string, unknown>[] = [];
    const receipt = {
      operationId: "operation-1",
      operationState: "committed" as const,
      resourceId: "submission-1",
    };
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        mutate: async (_name, args) => {
          mutations.push(args);
          return receipt;
        },
      }),
    );
    const input = {
      submissionId: "submission-1",
      expectedReviewVersion: version,
      decision: "approve" as const,
      privateReason: "Source confirmed",
      idempotencyKey: "decision-key-1",
    };

    assert.deepEqual(
      await handlers.decide(input),
      await handlers.decide(input),
    );
    assert.equal(mutations.length, 2);
    assert.equal(mutations[0]?.idempotencyKey, "decision-key-1");
    assert.equal(mutations[1]?.idempotencyKey, "decision-key-1");
  });

  it("keeps own withdrawal independent from reviewer email attestation", async () => {
    let verified = false;
    const handlers = createMcpMediaReviewHandlers(
      dependencies({
        verifyContributorEmail: async () => {
          verified = true;
          return false;
        },
      }),
    );

    const input = {
      submissionId: "submission-1",
      expectedReviewVersion: version,
      idempotencyKey: "withdraw-key",
    };
    const result = await handlers.withdraw(input);
    assert.equal(result.structuredContent?.operationState, "committed");
    assert.deepEqual(await handlers.withdraw(input), result);
    assert.equal(verified, false);
  });
});
import sharp from "sharp";
import { validateAndPrepareProfileAsset } from "../../apps/web/src/lib/server/profile-asset-validation";
it("renders distinct current and real prepared candidate renditions without fetching donor URLs", async () => {
  const prepared = await validateAndPrepareProfileAsset(candidate, "image/png");
  assert.notEqual(
    prepared.display.contentSha256,
    prepared.download.contentSha256,
  );
  const current = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const currentHash = createHash("sha256").update(current).digest("hex");
  const d = detail({
    currentImage: {
      kind: "managed",
      assetId: "current",
      contentSha256: currentHash,
    },
  });
  d.candidate.contentSha256 = prepared.download.contentSha256;
  const handlers = createMcpMediaReviewHandlers(
    dependencies({
      query: async (name) =>
        name === "candidate"
          ? {
              storageKey: "download",
              mimeType: "image/png",
              profileDisplayName: "Fixture",
            }
          : name === "current"
            ? {
                storageKey: "current",
                mimeType: "image/png",
                profileDisplayName: "Fixture",
                reviewVersion: version,
              }
            : d,
      readStoredObject: async (key) => ({
        body: key === "current" ? current : prepared.download.body,
        contentType: "image/png",
      }),
    }),
  );
  const a = await handlers.preview({
    submissionId: "submission-1",
    expectedReviewVersion: version,
  });
  const b = await handlers.preview({
    submissionId: "submission-1",
    expectedReviewVersion: version,
    target: "current",
  });
  assert.equal(a.content[0]?.type, "image");
  assert.equal(b.content[0]?.type, "image");
  assert.notDeepEqual(a.content, b.content);
});
it("bounds remote current previews to server-selected artwork and refuses changed or unavailable snapshots", async () => {
  for (const kind of ["legacy", "automatic"] as const) {
    const d = detail({
      currentImage: {
        kind,
        url:
          kind === "legacy"
            ? "https://current.example/image"
            : "/api/profile-link-artwork/group?v=1",
      },
    });
    const seen: string[] = [];
    let details = 0;
    for (const outcome of ["ok", "changed", "blocked"]) {
      details = 0;
      const h = createMcpMediaReviewHandlers(
        dependencies({
          query: async (name) =>
            name === "current"
              ? {
                  profileDisplayName: "Fixture",
                  reviewVersion: version,
                  sourceKind: kind,
                  sourceUrl: "https://current.example/image",
                  ...(kind === "automatic"
                    ? { artworkKey: "group", artworkKind: "vrchat_group" }
                    : {}),
                }
              : {
                  ...d,
                  reviewVersion:
                    ++details > 1 && outcome === "changed"
                      ? "changed"
                      : version,
                },
          readRemoteImage: async (input) => {
            seen.push(input.sourceUrl);
            if (outcome === "blocked") throw Error("private redirect details");
            return { body: candidate, contentType: "image/png" };
          },
          readStoredObject: async () => {
            throw Error("unexpected stored fetch");
          },
        }),
      );
      const result = await h.preview({
        submissionId: "submission-1",
        expectedReviewVersion: version,
        target: "current",
      });
      assert.equal(result.isError, outcome === "ok" ? undefined : true);
      assert.doesNotMatch(JSON.stringify(result), /private redirect details/);
    }
    assert.deepEqual(seen, Array(3).fill("https://current.example/image"));
    const absent = createMcpMediaReviewHandlers(
      dependencies({
        query: async () => detail({ currentImage: null }),
        readRemoteImage: async () => {
          throw Error("must not fetch");
        },
      }),
    );
    assert.equal(
      (
        await absent.preview({
          submissionId: "submission-1",
          expectedReviewVersion: version,
          target: "current",
        })
      ).isError,
      true,
    );
  }
});
import { randomBytes, createHash } from "node:crypto";
it("adapts a high-entropy 2048-square stored JPEG to bounded PNG", async () => {
  const jpeg = await sharp(randomBytes(2048 * 2048 * 3), {
    raw: { width: 2048, height: 2048, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
  const hash = createHash("sha256").update(jpeg).digest("hex");
  assert.ok((await sharp(jpeg).png().toBuffer()).byteLength > 4 * 1024 * 1024);
  const d = detail();
  d.candidate.contentSha256 = hash;
  const handlers = createMcpMediaReviewHandlers(
    dependencies({
      query: async (name) =>
        name === "candidate"
          ? {
              storageKey: "quarantine/test.jpg",
              mimeType: "image/jpeg",
              profileDisplayName: "Fixture",
            }
          : d,
      readStoredObject: async () => ({ body: jpeg, contentType: "image/jpeg" }),
    }),
  );
  const result = await handlers.preview({
    submissionId: "submission-1",
    expectedReviewVersion: version,
  });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]?.type, "image");
  const img = result.content[0];
  assert.ok(img?.type === "image");
  const bytes = Buffer.from(img.data, "base64");
  assert.ok(bytes.byteLength <= 4 * 1024 * 1024);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.ok(metadata.width! < 2048);
});
it("selected decisions transact separately, preserve order and snapshot only explicit inputs", async () => {
  const calls: string[] = [];
  const handlers = createMcpMediaReviewHandlers(
    dependencies({
      mutate: async (_name, args) => {
        calls.push(String(args.submissionId));
        if (args.submissionId === "bad") throw new Error("no access");
        return {
          operationId: String(args.idempotencyKey),
          operationState: "committed",
          resourceId: String(args.submissionId),
        };
      },
    }),
  );
  const one = {
    submissionId: "one",
    expectedReviewVersion: version,
    decision: "approve",
    privateReason: "Examined",
    idempotencyKey: "one",
  };
  const input = {
    decisions: [one, { ...one, submissionId: "bad", idempotencyKey: "bad" }],
  };
  const pending = handlers.decideSelected(input);
  input.decisions.push({ ...one, submissionId: "appended" });
  const result = await pending;
  assert.deepEqual(calls, ["one", "bad"]);
  assert.deepEqual(
    (
      result.structuredContent?.receipts as Array<{ operationState: string }>
    ).map((x) => x.operationState),
    ["committed", "in_progress"],
  );
  await assert.rejects(handlers.decideSelected({ decisions: [] }));
  await assert.rejects(
    handlers.decideSelected({ decisions: Array(21).fill(one) }),
  );
  await assert.rejects(handlers.decideSelected({ status: "submitted" }));
});

it("declares evidence and publishes only through separate explicit commands", async () => {
  const mutations: Array<{ name: string; args: Record<string, unknown> }> = [];
  const handlers = createMcpMediaReviewHandlers(
    dependencies({
      mutate: async (name, args) => {
        mutations.push({ name, args });
        return { operationId: "receipt", operationState: "committed" };
      },
    }),
  );
  await handlers.get({ submissionId: "submission-1" });
  await handlers.preview({
    submissionId: "submission-1",
    expectedReviewVersion: version,
  });
  assert.equal(mutations.length, 0);
  await assert.rejects(
    handlers.declare({
      submissionId: "submission-1",
      expectedReviewVersion: version,
      idempotencyKey: "declaration",
    }),
  );
  await handlers.declare({
    submissionId: "submission-1",
    expectedReviewVersion: version,
    idempotencyKey: "declaration",
    identityConfirmed: true,
    attributionConfirmed: true,
    publicationPermitted: true,
    noKnownRestrictions: true,
  });
  assert.equal(mutations[0]?.name, "declare");
  assert.equal(mutations.length, 1);
  await handlers.publish({
    submissionId: "submission-1",
    expectedReviewVersion: version,
    idempotencyKey: "publication",
  });
  assert.equal(mutations[1]?.name, "publish");
  assert.equal(mutations[1]?.args.actorUserId, "user-1");
  await assert.rejects(
    handlers.publish({
      submissionId: "submission-1",
      expectedReviewVersion: version,
      idempotencyKey: "publication",
      actorUserId: "other",
    }),
  );
});

it("contribution handlers bind verified actor, exact command and strict receipt/detail output", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const receipt = { operationId: "operation-1", operationState: "committed" };
  const projection = { submissionId: "submission-1", assetId: "asset-1", profileId: "profile-1", profileSlug: "fixture", contributionVersion: version, metadata: { label: "Image", credit: "Creator" }, canSelectPrimary: true, canClearPrimary: false, canProposePlacement: false, canEditMetadata: true, canRemove: true };
  const handlers = createMcpMediaReviewHandlers(dependencies({
    query: async (name, args) => { calls.push({ name, args }); return projection; },
    mutate: async (name, args) => { calls.push({ name, args }); return receipt; },
  }));
  const base = { submissionId: "submission-1", expectedContributionVersion: version, idempotencyKey: "same-key" };
  assert.deepEqual((await handlers.contributionGet({ submissionId: "submission-1" })).structuredContent, projection);
  for (const [operation, input] of [
    ["contributionManage", { ...base, action: "update_metadata", metadata: { credit: "Creator" } }],
    ["contributionPlace", { ...base, action: "select_primary" }],
    ["contributionProposePlacement", base],
  ] as const) {
    assert.deepEqual((await handlers[operation](input)).structuredContent, receipt);
    assert.deepEqual(calls.at(-1), { name: operation, args: { actorUserId: "user-1", emailVerified: true, emailVerificationAttestedAt: 2000, ...input } });
    await assert.rejects(() => handlers[operation]({ ...input, actorUserId: "forged" }));
  }
  const invalid = createMcpMediaReviewHandlers(dependencies({ query: async () => ({ ...projection, reviewerUserId: "private" }), mutate: async () => ({ ...receipt, privateOwnerAsset: "private" }) }));
  await assert.rejects(() => invalid.contributionGet({ submissionId: "submission-1" }));
  await assert.rejects(() => invalid.contributionPlace({ ...base, action: "clear_primary" }));
});
it("known unavailable contribution returns the stable tool refusal", async () => {
  const handlers = createMcpMediaReviewHandlers(dependencies({ query: async () => null }));
  const result = await handlers.contributionGet({ submissionId: "submission-1" });
  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: "text", text: "Contribution unavailable." }]);
});

it("review list follows empty batch checkpoints before reporting the queue", async () => {
  const cursors: unknown[] = [];
  const handlers = createMcpMediaReviewHandlers(dependencies({ query: async (name, args) => {
    assert.equal(name, "list");
    const cursor = (args.paginationOpts as { cursor: unknown }).cursor;
    cursors.push(cursor);
    return cursor === null ? { page: [], continueCursor: "checkpoint", isDone: false }
      : { page: [detail()], continueCursor: "done", isDone: true };
  } }));
  const result = await handlers.list({ batchId: "batch" });
  assert.deepEqual(cursors, [null, "checkpoint"]);
  assert.equal((result.structuredContent as { page: unknown[] }).page.length, 1);
});

it("refreshes email attestation across a slow checkpoint traversal", async () => {
  let now = 2000, calls = 0, checks = 0;
  const handlers = createMcpMediaReviewHandlers(dependencies({ now: () => now,
    verifyContributorEmail: async () => { checks++; return true; },
    query: async (_name, args) => {
      assert.equal(args.emailVerificationAttestedAt, now);
      if (++calls === 1) { now += 121000; return { page: [], continueCursor: "later", isDone: false }; }
      return { page: [detail()], continueCursor: "done", isDone: true };
    },
  }));
  const result = await handlers.list({ batchId: "batch" });
  assert.equal((result.structuredContent as { page: unknown[] }).page.length, 1);
  assert.equal(checks, 2);
});

it("keeps the last cursor with an explicit error if a checkpoint stops advancing", async () => {
  let calls = 0;
  const handlers = createMcpMediaReviewHandlers(dependencies({ query: async () => {
    calls++; return { page: [], continueCursor: "last-good", isDone: false };
  } }));
  const result = await handlers.list({ batchId: "batch" });
  assert.equal(calls, 2);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent?.continueCursor, "last-good");
  assert.ok(result.content.some(item => item.type === "text" && item.text === "PAGE_CURSOR_INVALID"));
});
it("keeps a resumable cursor after bounded empty checkpoint traversal", async () => {
  let calls = 0;
  const handlers = createMcpMediaReviewHandlers(dependencies({ query: async () => ({
    page: [], continueCursor: String(++calls), isDone: false,
  }) }));
  const result = await handlers.list({ batchId: "batch" });
  assert.equal(calls, 41);
  assert.equal(result.structuredContent?.continueCursor, "41");
  assert.equal(result.structuredContent?.isDone, false);
});

it("previews a validated 4167-square stored candidate within output bounds", async () => {
  const source = await sharp({
    create: { width: 4167, height: 4167, channels: 4, background: "#663399" },
  }).png().toBuffer();
  const prepared = await validateAndPrepareProfileAsset(source, "image/png");
  assert.equal(prepared.download.width, 4167);
  assert.equal(prepared.download.height, 4167);
  const d = detail();
  d.candidate.contentSha256 = prepared.download.contentSha256;
  const handlers = createMcpMediaReviewHandlers(dependencies({
    query: async (name) => name === "candidate"
      ? { storageKey: "large-candidate", mimeType: "image/png", profileDisplayName: "Fixture" }
      : d,
    readStoredObject: async () => ({ body: prepared.download.body, contentType: "image/png" }),
    mutate: async () => { throw new Error("Preview must not mutate"); },
  }));
  const result = await handlers.preview({ submissionId: "submission-1", expectedReviewVersion: version });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  const image = result.content[0];
  assert.ok(image?.type === "image");
  const bytes = Buffer.from(image.data, "base64");
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2048);
  assert.equal(metadata.height, 2048);
  assert.ok(bytes.byteLength <= 4 * 1024 * 1024);
});

it("refuses stored previews outside upload dimensions or still-image policy", async () => {
  const oversizedSide = await sharp({
    create: { width: 8193, height: 1, channels: 3, background: "red" },
  }).png().toBuffer();
  const oversizedPixels = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8193" height="8193"><rect width="8193" height="8193" fill="red"/></svg>');
  const animated = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]), {
    raw: { width: 2, height: 2, channels: 3, pageHeight: 1 },
  }).gif().toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  for (const [body, mimeType] of [
    [oversizedSide, "image/png"],
    [oversizedPixels, "image/svg+xml"],
    [animated, "image/gif"],
  ] as const) {
    const d = detail();
    d.candidate.contentSha256 = createHash("sha256").update(body).digest("hex");
    const handlers = createMcpMediaReviewHandlers(dependencies({
      query: async (name) => name === "candidate"
        ? { storageKey: "invalid-candidate", mimeType, profileDisplayName: "Fixture" }
        : d,
      readStoredObject: async () => ({ body, contentType: mimeType }),
    }));
    const result = await handlers.preview({ submissionId: "submission-1", expectedReviewVersion: version });
    assert.equal(result.isError, true);
    assert.equal(result.content[0]?.type, "text");
    assert.match(JSON.stringify(result), /could not be rendered safely/);
  }
});

it("preserves remote current first-frame and wide-artwork previews with the original pixel budget", async () => {
  const wide = await sharp({
    create: { width: 10000, height: 1, channels: 3, background: "red" },
  }).png().toBuffer();
  const gif = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]), {
    raw: { width: 2, height: 2, channels: 3, pageHeight: 1 },
  }).gif().toBuffer();
  const animated = await sharp(gif, { animated: true }).webp().toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  const excessivePixels = await sharp({
    create: { width: 4167, height: 4167, channels: 3, background: "red" },
  }).png().toBuffer();
  for (const [body, accepted] of [[wide, true], [animated, true], [excessivePixels, false]] as const) {
    const handlers = createMcpMediaReviewHandlers(dependencies({
      query: async (name) => name === "current"
        ? { profileDisplayName: "Fixture", reviewVersion: version, sourceKind: "legacy", sourceUrl: "https://current.example/image" }
        : detail({ currentImage: { kind: "legacy", url: "https://current.example/image" } }),
      readRemoteImage: async () => ({ body, contentType: "image/png" }),
      readStoredObject: async () => { throw new Error("Remote preview must not read stored candidates"); },
    }));
    const result = await handlers.preview({ submissionId: "submission-1", expectedReviewVersion: version, target: "current" });
    assert.equal(result.isError, accepted ? undefined : true);
    if (accepted) {
      const image = result.content[0];
      assert.ok(image?.type === "image");
      const bytes = Buffer.from(image.data, "base64");
      assert.ok(bytes.byteLength <= 4 * 1024 * 1024);
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "png");
      assert.ok(metadata.width && metadata.width <= 2048);
      assert.ok(metadata.height && metadata.height <= 2048);
    }
  }
});

it("preserves RGBA pixels through the bounded raw preview raster", async () => {
  const body = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 120, g: 30, b: 200, alpha: 0.25 } },
  }).png().toBuffer();
  const prepared = await validateAndPrepareProfileAsset(body, "image/png");
  const d = detail();
  d.candidate.contentSha256 = prepared.download.contentSha256;
  const handlers = createMcpMediaReviewHandlers(dependencies({
    query: async (name) => name === "candidate"
      ? { storageKey: "transparent-candidate", mimeType: "image/png", profileDisplayName: "Fixture" }
      : d,
    readStoredObject: async () => ({ body: prepared.download.body, contentType: "image/png" }),
  }));
  const result = await handlers.preview({ submissionId: "submission-1", expectedReviewVersion: version });
  const image = result.content[0];
  assert.ok(image?.type === "image");
  assert.deepEqual(
    await sharp(Buffer.from(image.data, "base64")).ensureAlpha().raw().toBuffer(),
    await sharp(prepared.download.body).ensureAlpha().raw().toBuffer(),
  );
});

it("preserves resized 16-bit and grayscale-alpha stored PNG previews", async () => {
  const original = sharp({
    create: { width: 2200, height: 2200, channels: 4, background: { r: 120, g: 30, b: 200, alpha: 0.25 } },
  });
  const png16 = await original.clone().toColourspace("rgb16").png().toBuffer();
  const grayscale = await original.clone().toColourspace("b-w").png().toBuffer();
  assert.equal((await sharp(png16).metadata()).depth, "ushort");
  assert.equal((await sharp(grayscale).metadata()).channels, 2);
  for (const source of [png16, grayscale]) {
    const prepared = await validateAndPrepareProfileAsset(source, "image/png");
    for (const body of [source, prepared.download.body]) {
      const d = detail();
      d.candidate.contentSha256 = createHash("sha256").update(body).digest("hex");
      const handlers = createMcpMediaReviewHandlers(dependencies({
        query: async name => name === "candidate"
          ? { storageKey: "synthetic-colour-candidate", mimeType: "image/png", profileDisplayName: "Fixture" }
          : d,
        readStoredObject: async () => ({ body, contentType: "image/png" }),
      }));
      const result = await handlers.preview({ submissionId: "submission-1", expectedReviewVersion: version });
      const image = result.content[0];
      assert.ok(image?.type === "image");
      const preview = Buffer.from(image.data, "base64");
      const directPng = await sharp(body).rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 }).toBuffer();
      assert.equal((await sharp(preview).metadata()).width, 2048);
      assert.ok(preview.byteLength <= 4 * 1024 * 1024);
      assert.deepEqual(
        await sharp(preview).ensureAlpha().raw().toBuffer(),
        await sharp(directPng).ensureAlpha().raw().toBuffer(),
      );
    }
  }
});
