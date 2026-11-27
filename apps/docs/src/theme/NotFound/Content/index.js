import clsx from "clsx";
import Link from "@docusaurus/Link";
import Translate from "@docusaurus/Translate";
import Heading from "@theme/Heading";

import styles from "./styles.module.css";

const sections = [
  { label: "Public Docs", to: "/docs/public/" },
  { label: "Developer Docs", to: "/docs/developers/" },
  { label: "Engineering Docs", to: "/docs/engineering/" },
];

export default function NotFoundContent({ className }) {
  return (
    <main className={clsx(styles.main, className)}>
      <div className={styles.recovery}>
        <Heading as="h1" className={styles.title}>
          <Translate id="theme.NotFound.title" description="The title of the 404 page">
            Page Not Found
          </Translate>
        </Heading>
        <Link className={clsx("button button--primary", styles.primary)} to="/docs/">
          Browse docs
        </Link>
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
