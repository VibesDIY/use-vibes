[![Join our
Discord](https://discord-badge.selem.workers.dev/i/vnpWycj4Ta.svg)](https://discord.gg/vnpWycj4Ta)

# use-vibes — the open home of Vibes DIY

[Vibes DIY](https://vibes.diy/) turns a plain-words description into a real, live, shareable app — and everything you make keeps changing just by talking to it. This repository is the public home for the Vibes DIY open-source packages: docs, examples, and the place to [open an issue](https://github.com/VibesDIY/use-vibes/issues) about any of them (or about the platform itself).

## The open packages

All published on npm under Apache-2.0:

| Package | What it is |
| --- | --- |
| [`use-vibes`](https://www.npmjs.com/package/use-vibes) | React components and hooks for AI micro-apps — the library behind vibes |
| [`vibes-diy`](https://www.npmjs.com/package/vibes-diy) | The CLI: generate, edit, pull, push, and publish vibes from your terminal |
| [`@vibes.diy/prompts`](https://www.npmjs.com/package/@vibes.diy/prompts) | The system prompts Vibes DIY uses for app generation — build vibes with your own model and tools |
| [`call-ai`](https://www.npmjs.com/package/call-ai) | Lightweight LLM call library with streaming |
| [`img-vibes`](https://www.npmjs.com/package/img-vibes) | AI image generation component |

## Quick start

The fastest way to make an app is [vibes.diy](https://vibes.diy/) — no setup, describe what you want, share the link.

From the terminal:

```bash
npx vibes-diy login
npx vibes-diy generate "a scoreboard for our pickup basketball games"
```

In your own React code:

```bash
pnpm add use-vibes
```

```jsx
import { ImgGen } from "use-vibes";

function MyComponent() {
  return <ImgGen prompt="A sunset over mountains" />;
}
```

The previous standalone `use-vibes` README, with the full ImgGen API surface, is preserved at [`notes/legacy-README.md`](notes/legacy-README.md).

## Docs and community

- **Creator documentation:** <https://good.vibes.diy/creator-documentation/>
- **Blog:** <https://good.vibes.diy/>
- **Discord:** <https://discord.gg/vnpWycj4Ta>
- **Bluesky:** <https://bsky.app/profile/vibes.diy>

## Issues

Bug reports and feature requests for any of the packages above — or for the vibes.diy platform — are welcome [here](https://github.com/VibesDIY/use-vibes/issues). For quick questions, Discord is usually faster.

## License

[Apache-2.0](LICENSE.md)
