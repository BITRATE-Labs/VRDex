import clsx from "clsx";
import Link from "@docusaurus/Link";
import Translate from "@docusaurus/Translate";
import useBaseUrl from "@docusaurus/useBaseUrl";
import Heading from "@theme/Heading";

import styles from "./styles.module.css";

const sections = [
  { label: "Browse docs", to: "/docs/" },
  { label: "Public Docs", to: "/docs/public/" },
  { label: "Developer Docs", to: "/docs/developers/" },
  { label: "Engineering Docs", to: "/docs/engineering/" },
];

export default function NotFoundContent({ className }) {
  const searchPath = useBaseUrl("/search/");

  return (
    <main className={clsx(styles.main, className)}>
      <div className={styles.recovery}>
        <Heading as="h1" className={styles.title}>
          <Translate id="theme.NotFound.title" description="The title of the 404 page">
            Page Not Found
          </Translate>
        </Heading>
        <form action={searchPath} className={styles.search} method="get" role="search">
          <input aria-label="Search docs" name="q" placeholder="Search docs" required type="search" />
          <button className={clsx("button button--primary", styles.primary)} type="submit">
            Search
          </button>
        </form>
        <nav aria-label="Docs" className={styles.sections}>
          <ul>
            {sections.map(({ label, to }) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
