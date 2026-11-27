"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type ApiOperation = {
  method: string;
  operationId: string;
  path: string;
  responseCodes: string[];
  summary: string;
  tags: string[];
};

export function EndpointDirectory({ operations, children }: { operations: ApiOperation[]; children: ReactNode }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const search = query.trim().toLowerCase();
  const terms = search.split(/\s+/);
  const matches = search ? operations.filter((operation) => {
    const text = [operation.method, operation.path, operation.summary, ...operation.tags].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  }) : operations;

  return (
    <section aria-label="Endpoints" className="grid gap-3">
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:gap-x-4">
        <div className="relative col-span-2 sm:min-w-52 sm:flex-1 [@media(scripting:none)]:hidden">
          <input
            ref={input}
            type="search"
            aria-label="Filter endpoints"
            aria-controls="api-endpoints"
            placeholder="Filter endpoints"
            className={cn(
              "min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-focus-ring [&::-webkit-search-cancel-button]:appearance-none",
              query && "pe-16",
            )}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {query ? (
            <Button
              variant="ghost"
              size="sm"
              className="absolute inset-y-0 end-0 min-w-11"
              type="button"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>

        <p role="status" className="text-xs text-muted tabular-nums sm:me-auto sm:whitespace-nowrap">
          {matches.length} {matches.length === 1 ? "operation" : "operations"}
        </p>
        {children}
      </div>

      <ul role="list" aria-label="Operations" className="grid gap-2.5" id="api-endpoints">
        {matches.map((operation) => (
          <li className="min-w-0" key={operation.operationId}>
            <Card className="grid gap-y-1 px-3.5 py-2.5 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-2.5 sm:px-4" padding="none">
              <span className={cn(
                "inline-flex min-w-12 items-center justify-center justify-self-start self-start rounded-control border px-1.5 py-0.5 font-mono text-xs font-semibold",
                operation.method === "GET"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-accent/25 bg-accent/10 text-accent-strong",
              )}>{operation.method}</span>
              <code className="min-w-0 self-center font-mono text-sm text-foreground [overflow-wrap:anywhere]">
                {operation.path.split(/(?=\/)/).map((segment, index) => (
                  <Fragment key={index}>
                    {index > 0 ? <wbr /> : null}
                    {segment}
                  </Fragment>
                ))}
              </code>
              <p className="text-sm leading-5 text-foreground sm:col-start-2">{operation.summary}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted sm:col-start-2">
                {operation.tags.length ? (
                  <ul className="flex flex-wrap gap-x-2" aria-label="Tags">
                    {operation.tags.map((tag) => <li key={tag}>{tag}</li>)}
                  </ul>
                ) : null}
                <ul className="flex flex-wrap gap-x-2 tabular-nums" aria-label="Responses">
                  {operation.responseCodes.map((code) => <li key={code}>{code}</li>)}
                </ul>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {matches.length === 0 ? <p className="rounded-panel border border-border bg-surface px-4 py-5 text-sm text-muted">No results</p> : null}
    </section>
  );
}
