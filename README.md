# autospec

### Open source end-to-end (e2e) test generation for web apps

Autospec is an AI agent that autonomously explores your web application,
generates commonsense test specifications, and executes them — producing
reusable Playwright test files. It uses vision and language models to mimic
real user judgement on the entire UI after each interaction, deciding whether
behavior is correct rather than checking for regressions against rigidly
defined previous behavior.

- Tests new features immediately after implementation, not just regressions.
- Requires no configuration — point it at a URL and go.
- Generates standard Playwright `.spec.js` files you can re-run anytime.

### Quick start

Generate and run 10 specs on TodoMVC:

<!-- prettier-ignore -->
```bash
npx autospecai --url https://todomvc.com/examples/react/dist/ --apikey YOUR_ANTHROPIC_API_KEY
```

You'll need to say "yes" to install the autospecai package, and the first run
may take a few minutes to download dependencies like browser binaries.

When the run completes, you'll see a summary of passed and failed tests.
Passing specs are saved as Playwright test files in the `trajectories/` folder
alongside video recordings and screenshots. Re-run them anytime:

<!-- prettier-ignore -->
```bash
npx playwright test
```

Depending on your existing Playwright setup, you may need to add `"trajectories"`
to the `testDir` in your `playwright.config.js` file.

### Using environment variables instead of passing keys as a flag

Copy the sample .env file and fill in the API key for your chosen model:

<!-- prettier-ignore -->
```bash
cp .env.example .env
nano .env
```

### Configuration

<!-- prettier-ignore -->
```bash
> npx autospecai --help
    Usage: npx autospecai --url <url> [--model <model>] [--spec_limit <limit>] [--help | -h]

    Required:
    --url <url>          The target URL to run the autospec tests against.

    Optional:
    --help, -h           Show this help message.
    --version, -v        Show version.
    --spec_limit <limit> The max number of specs to generate. Default 10.
    --model <model>      The model to use for spec generation:
                            * "claude-opus-4-6" (default)
                            * "gpt-5.4"
                            * "gemini-2.5-flash"
    --apikey <key>       The relevant API key for the chosen model's API.
                            * If not specified, we'll fall back on the
                              following environment variables:
                            * ANTHROPIC_API_KEY
                            * OPENAI_API_KEY
                            * GOOGLE_GENERATIVE_AI_API_KEY
    --specFile <file>    Path to a JSON file of pre-defined specs to run
                         (or "-" to read from stdin).
```

### How it works

1. **Plan** — Crawls up to 3 pages from your URL, captures accessibility
   snapshots, and asks the model to generate test specs.
2. **Execute** — Runs each spec in parallel, each in its own isolated browser
   context. The agent uses semantic actions (click by role, fill by label,
   press keys, scroll, navigate) and re-reads the page's accessibility
   snapshot after every step.
3. **Report** — Prints a pass/fail summary and writes Playwright `.spec.js`
   files for passing tests using modern locator APIs (`getByRole`,
   `getByLabel`, `getByText`).

### Architecture

```
src/
├── cli.ts        # CLI argument parsing
├── index.ts      # Orchestration entry point
├── ai.ts         # Model provider setup (Vercel AI SDK)
├── planner.ts    # Page crawling & test plan generation
├── executor.ts   # Agent loop for test execution
├── reporter.ts   # Output formatting & Playwright codegen
├── browser.ts    # Browser lifecycle & snapshots
└── schemas.ts    # Zod schemas & TypeScript types
```

### Requirements

- Node.js >= 22
- An API key for one of the supported models

### Contributing

autospec is open-source and we welcome contributors! Please open an
[issue](https://github.com/zachblume/autospec/issues) or
[pull request](https://github.com/zachblume/autospec/pulls) to get started.

### Contributors

<a href="https://github.com/zachblume/autospec/graphs/contributors"><img src="https://contrib.rocks/image?repo=zachblume/autospec" /></a>

### License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.
