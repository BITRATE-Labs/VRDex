"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useSearchSuggestions, type SearchSuggestion } from "@/app/_components/use-search-suggestions";
import { ProfileSuggestion } from "@/app/_components/profile-suggestion";
import { Button } from "@/components/ui/button";
import { previewVideoLink } from "./video-link";
import styles from "./preview.module.css";

export function PersonLookup({onSelect, onReset, disabled}: {onReset:()=>void; onSelect:(name:string, url:string)=>void; disabled:boolean}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<SearchSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<ReturnType<typeof previewVideoLink>[]>([]);
  const {suggestions, activeIndex, setActiveIndex, reset} = useSearchSuggestions(query, "person");
  const id = useId();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const expanded = open && Boolean(query.trim());
  async function choose(candidate: SearchSuggestion) {
    onReset(); controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setPerson(candidate); setOpen(false); setQuery(candidate.title); setLinks([]); setError(""); setLoading(true);
    try {
      const response = await fetch(`/playwright/broadcast-jam/person-streams?slug=${encodeURIComponent(candidate.slug)}`, {signal:request.signal});
      if (!response.ok) throw Error();
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("links" in data) || !Array.isArray(data.links)) throw Error();
      const found = data.links.flatMap((link: unknown) => {
        if (!link || typeof link !== "object" || !("url" in link) || typeof link.url !== "string") return [];
        try { return [previewVideoLink(link.url)]; } catch { return []; }
      });
      if (request.signal.aborted) return;
      setLinks(found);
      if (found.length === 1 && found[0]) onSelect(candidate.title, found[0].url);
    } catch { if (!request.signal.aborted) setError("Couldn’t load stream links. Try again or paste a link."); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  return <div className={styles.personLookup}>
    <label htmlFor={id}>Find a person</label>
    <div className={styles.personSearch} onBlur={e => {if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);}}>
      <input id={id} role="combobox" aria-autocomplete="list" aria-controls={`${id}-results`} aria-expanded={expanded} aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined} autoComplete="off" placeholder="Search people…" disabled={disabled || loading} value={query} onFocus={() => {if (!person) setOpen(true);}} onChange={e => {onReset(); reset(); setQuery(e.target.value); setPerson(null); setLinks([]); setError(""); setOpen(true);}} onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Escape") {setOpen(false); e.preventDefault();}
        if (e.key === "ArrowDown" && suggestions.length) {e.preventDefault(); setOpen(true); setActiveIndex(index => (index + 1) % suggestions.length);}
        if (e.key === "ArrowUp" && suggestions.length) {e.preventDefault(); setActiveIndex(index => index <= 0 ? suggestions.length - 1 : index - 1);}
        if (e.key === "Enter" && expanded && suggestions[activeIndex]) {e.preventDefault(); void choose(suggestions[activeIndex]);}
      }} />
      {expanded && <div className={styles.personResults} id={`${id}-results`} role="listbox" aria-label="People">{suggestions.map((candidate,index) => <button key={candidate.slug} id={`${id}-${index}`} role="option" aria-selected={index === activeIndex} type="button" onMouseDown={e => e.preventDefault()} onClick={() => void choose(candidate)}><ProfileSuggestion option={{kind:"person",slug:candidate.slug,title:candidate.title,href:candidate.routePath,imageKind:"profile",imageUrl:candidate.profileImageUrl ?? candidate.imageUrl,context:candidate.subtitle,trustLabel:candidate.trustLabel}} /></button>)}{suggestions.length === 0 && <p role="status">No results yet. Try a name or paste a link below.</p>}</div>}
    </div>
    {loading && <p role="status" className={styles.inputUrl}>Loading stream links…</p>}
    {person && !loading && !error && links.length === 0 && <p role="status" className={styles.inputUrl}>No stream links on this profile. Paste a link below.</p>}
    {error && <div role="alert"><p className={styles.inputUrl}>{error}</p><Button size="sm" onClick={() => person && void choose(person)}>Try again</Button></div>}
    {links.length > 1 && <div className={styles.personStreams}><p className={styles.inputUrl}>Choose a stream</p>{links.map(link => <Button key={link.key} disabled={disabled} onClick={() => person && onSelect(person.title,link.url)}>{link.provider} · {link.title}</Button>)}</div>}
  </div>;
}
