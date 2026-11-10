import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme } from 'vitepress'

const docsDir = fileURLToPath(new URL('..', import.meta.url))
const repo = 'https://github.com/thejacedev/Noteriv'

// The site is served from https://thejacedev.github.io/Noteriv/, so every URL
// lives under /Noteriv/. The Pages workflow passes the real base path and URL
// from the repository's Pages settings, so moving to a custom domain (e.g.
// docs.noteriv.com) only needs the domain set in Settings → Pages and a DNS
// record; the next deploy is built for / automatically.
const withSlash = (url: string) => url.replace(/\/*$/, '/')
const base = withSlash(process.env.DOCS_BASE || '/Noteriv/')
const siteUrl = withSlash(process.env.DOCS_URL || 'https://thejacedev.github.io/Noteriv/')

const { version } = JSON.parse(
  readFileSync(join(docsDir, '../desktop/package.json'), 'utf8'),
) as { version: string }

// Sidebar sections, in reading order. Pages inside each folder are sorted by
// the `order` field in their frontmatter, and labelled by `title`.
const sections: [dir: string, label: string][] = [
  ['getting-started', 'Getting Started'],
  ['editor', 'Editor'],
  ['features', 'Features'],
  ['views', 'Views'],
  ['sync', 'Sync'],
  ['themes', 'Themes & CSS Snippets'],
  ['plugins', 'Plugins'],
  ['mcp', 'MCP Server & AI'],
  ['mobile', 'Mobile'],
  ['reference', 'Reference'],
]

function frontmatter(file: string) {
  const src = readFileSync(file, 'utf8')
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src)?.[1] ?? ''
  const field = (key: string) =>
    new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm')
      .exec(block)?.[1]
      .replace(/^(['"])(.*)\1$/, '$2')
  return {
    title: field('title') ?? /^#\s+(.+)$/m.exec(src)?.[1] ?? file,
    order: Number(field('order') ?? 999),
  }
}

function section(dir: string, label: string): DefaultTheme.SidebarItem {
  const pages = readdirSync(join(docsDir, dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { title, order } = frontmatter(join(docsDir, dir, f))
      const isIndex = f === 'index.md'
      return {
        text: isIndex ? 'Overview' : title,
        link: isIndex ? `/${dir}/` : `/${dir}/${f.slice(0, -3)}`,
        order: isIndex ? -1 : order,
      }
    })
    .sort((a, b) => a.order - b.order || a.text.localeCompare(b.text))
  return {
    text: label,
    collapsed: dir !== 'getting-started',
    items: pages.map(({ text, link }) => ({ text, link })),
  }
}

const sidebar: DefaultTheme.SidebarItem[] = [
  ...sections.map(([dir, label]) => section(dir, label)),
  {
    text: 'Help',
    items: [
      { text: 'FAQ', link: '/faq' },
      { text: 'Development & Contributing', link: '/contributing' },
    ],
  },
]

export default defineConfig({
  base,
  lang: 'en-US',
  title: 'Noteriv Docs',
  description:
    'Documentation for Noteriv, the open-source, local-first markdown editor with a graph view, plugins, themes, Git/WebDAV sync and an MCP server.',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',

  // Internal planning notes that live in docs/ but are not user documentation.
  srcExclude: ['intelligent-knowledge-base-plan.md'],

  sitemap: { hostname: siteUrl },

  // The local search index is one ~700 kB chunk, fetched only when search opens.
  vite: { build: { chunkSizeWarningLimit: 1000 } },

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${base}logo.png` }],
    ['meta', { name: 'theme-color', content: '#1e1e2e' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Noteriv Docs' }],
    ['meta', { property: 'og:image', content: `${siteUrl}logo.png` }],
  ],

  markdown: {
    theme: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
    // Dataview queries (TABLE ... FROM ... WHERE) read best with SQL colors.
    languageAlias: { dataview: 'sql' },
    // Pages are compiled as Vue templates, so `{{date}}`-style template
    // variables (used all over the templates, daily-notes and flashcard pages)
    // would be parsed as Vue expressions. Fenced code is already safe; this
    // makes inline code and plain text render them literally too.
    config(md) {
      const codeInline = md.renderer.rules.code_inline!
      md.renderer.rules.code_inline = (tokens, idx, ...rest) => {
        tokens[idx].attrSet('v-pre', '')
        return codeInline(tokens, idx, ...rest)
      }
      const text = md.renderer.rules.text!
      md.renderer.rules.text = (...args) =>
        text(...args).replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;')
    },
  },

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Noteriv',

    nav: [
      { text: 'Guide', link: '/getting-started/', activeMatch: '^/getting-started/' },
      { text: 'Editor', link: '/editor/', activeMatch: '^/(editor|features|views|reference)/' },
      { text: 'Sync', link: '/sync/', activeMatch: '^/sync/' },
      {
        text: 'Customize',
        activeMatch: '^/(themes|plugins)/',
        items: [
          { text: 'Themes', link: '/themes/' },
          { text: 'Custom themes', link: '/themes/custom-themes' },
          { text: 'CSS snippets', link: '/themes/css-snippets' },
          { text: 'Plugins', link: '/plugins/' },
          { text: 'Creating plugins', link: '/plugins/creating-plugins' },
        ],
      },
      { text: 'AI & MCP', link: '/mcp/', activeMatch: '^/mcp/' },
      {
        text: `v${version}`,
        items: [
          { text: 'Download', link: `${repo}/releases/latest` },
          { text: 'All releases', link: `${repo}/releases` },
          { text: 'Contributing', link: '/contributing' },
          { text: 'Website', link: 'https://www.noteriv.com' },
        ],
      },
    ],

    sidebar,

    outline: { level: [2, 3] },

    search: { provider: 'local' },

    socialLinks: [{ icon: 'github', link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Jace Sleeman',
    },
  },
})
