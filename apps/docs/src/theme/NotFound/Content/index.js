import clsx from "clsx";
import Link from "@docusaurus/Link";
import Translate from "@docusaurus/Translate";
import Heading from "@theme/Heading";

import styles from "./styles.module.css";

export default function NotFoundContent({ className }) {
  return (
    <main className={clsx(styles.main, className)}>
      <div className={styles.recovery}>
        <Heading as="h1" className={styles.title}>
          <Translate id="theme.NotFound.title" description="The title of the 404 page">
            Page Not Found
          </Translate>
        </Heading>
        <div className={styles.actions}>
          <Link className={clsx("button button--primary", styles.primary)} to="/docs/">
            Browse docs
          </Link>
          <Link className={styles.secondary} to="/docs/developers/">
            Developer docs
          </Link>
        </div>
      </div>
    </main>
  );
}
