const lightCodeTheme = require("prism-react-renderer").themes.github;
const darkCodeTheme = require("prism-react-renderer").themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "VRDex Docs",
  url: "https://docs.vrdex.net",
  baseUrl: "/",
  organizationName: "BITRATE-Labs",
  projectName: "VRDex",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "../../docs/wiki",
          include: ["index.md", "find-events.md", "claim-a-profile.md"],
          routeBasePath: "docs",
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: ({ docPath }) => `https://github.com/BITRATE-Labs/VRDex/edit/main/docs/wiki/${docPath}`,
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: "VRDex Docs",
      items: [
        { to: "/docs/", label: "Guides", position: "left" },
        { href: "https://vrdex.net", label: "VRDex", position: "right" },
      ],
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
  },
};

module.exports = config;
