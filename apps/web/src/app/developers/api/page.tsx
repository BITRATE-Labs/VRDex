import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { getOpenApiDocument } from "@vrdex/api-contracts";
import { buttonVariants } from "@/components/ui/button";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { cn } from "@/lib/cn";
import { EndpointDirectory, type ApiOperation } from "./endpoint-directory";

export const dynamic = "force-static";

const httpMethods = ["get", "post", "put", "patch", "delete"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function collectOperations(): ApiOperation[] {
  const document = getOpenApiDocument();
  const paths = document.paths ?? {};

  return Object.entries(paths)
    .flatMap(([path, pathItem]) => {
      if (!isRecord(pathItem)) {
        return [];
      }

      return httpMethods.flatMap((method) => {
        const operation = pathItem[method];

        if (!isRecord(operation)) {
          return [];
        }

        const responses = isRecord(operation.responses) ? operation.responses : {};

        return [
          {
            method: method.toUpperCase(),
            operationId: textValue(operation.operationId, `${method}:${path}`),
            path,
            responseCodes: Object.keys(responses),
            summary: textValue(operation.summary, path),
            tags: stringList(operation.tags),
          },
        ];
      });
    })
    .sort((first, second) => first.path.localeCompare(second.path) || first.method.localeCompare(second.method));
}

const summaryClass = cn(
  buttonVariants({ variant: "surface", size: "sm" }),
  "min-h-11 list-none gap-1.5 [&::-webkit-details-marker]:hidden",
);
const panelClass = "absolute inset-x-0 top-full z-10 mt-2 max-h-[min(24rem,55dvh)] overflow-y-auto rounded-panel border border-border-strong bg-surface-strong p-2 shadow-lg sm:start-auto sm:w-80";

export default function ApiReferencePage() {
  const document = getOpenApiDocument();
  const operations = collectOperations();
  const tags = document.tags ?? [];
  const utilityLink = cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 justify-start");

  return (
    <PageShell className="py-5 sm:py-8">
      <PageContainer className="gap-3 sm:gap-4" max="5xl">
        <header>
          <h1 className="text-3xl font-semibold sm:text-4xl">{document.info.title}</h1>
          <p className="mt-1.5 font-mono text-xs text-muted">
            OpenAPI {document.openapi} / {document.info.version}
          </p>
        </header>

        <EndpointDirectory operations={operations}>
          <div className="flex items-center gap-2">
            <details className="group" name="api-reference-menu">
              <summary className={summaryClass}>
                Tags
                <ChevronDown aria-hidden="true" className="size-3.5 group-open:rotate-180" />
              </summary>
              <dl aria-label="Tags" tabIndex={0} className={cn(panelClass, "grid gap-2 px-4 py-3 focus-visible:outline-2 focus-visible:outline-focus-ring")}>
                {tags.map((tag) => (
                  <div className="border-b border-border pb-2 last:border-0 last:pb-0" key={tag.name}>
                    <dt className="text-sm font-medium">{tag.name}</dt>
                    {"description" in tag && typeof tag.description === "string" ? (
                      <dd className="mt-1 text-xs leading-5 text-muted">{tag.description}</dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </details>
            <details className="group" name="api-reference-menu">
              <summary className={summaryClass}>
                API tools
                <ChevronDown aria-hidden="true" className="size-3.5 group-open:rotate-180" />
              </summary>
              <nav aria-label="API tools" className={cn(panelClass, "grid")}>
                <a className={utilityLink} href="/api/v0/openapi.json">OpenAPI JSON</a>
                <a className={utilityLink} href="/api/v0/openapi.yaml">OpenAPI YAML</a>
                <Link className={utilityLink} href="/developers/tokens">Developer tokens</Link>
                <Link className={utilityLink} href="/developers/apps">OAuth apps</Link>
              </nav>
            </details>
          </div>
        </EndpointDirectory>
      </PageContainer>
    </PageShell>
  );
}
