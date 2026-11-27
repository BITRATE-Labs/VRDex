import styles from "@/components/clerk-auth-controls.module.css";
import { cn } from "@/lib/cn";

export const journeyAppearance = {
  elements: {
    rootBox: styles.journeyRoot,
    cardBox: styles.journeyCardBox,
    card: styles.journeyCard,
    header: styles.journeyHeader,
    formFieldInput: cn(styles.input, styles.journeyTarget),
    socialButtonsBlockButton: cn(styles.socialButton, styles.journeyTarget),
    formButtonPrimary: styles.journeyTarget,
  },
  variables: {
    borderRadius: "var(--radius-control)",
    colorBackground: "var(--surface-strong)",
    colorForeground: "var(--foreground)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted)",
    colorPrimary: "var(--accent)",
    colorPrimaryForeground: "var(--inverse)",
  },
};

export const suggestionAppearance = {
  ...journeyAppearance,
  elements: {
    ...journeyAppearance.elements,
    card: cn(styles.journeyCard, styles.suggestionCard),
    footerActionLink: styles.suggestionFooterLink,
    formFieldInputShowPasswordButton: styles.suggestionPasswordToggle,
  },
};
