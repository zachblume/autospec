# autospec

### Open source end-to-end (e2e) test generation for web apps

autospec is an end-to-end test/QA agent, using vision and text language models
to explore and generate commonsense test specifications for web applications.
It aims to mimic user-like judgement on the entire UI output after each
interaction to decide whether to raise an error about how an application
behaves, instead of catching regressions against rigidly defined previous
behavior.

-   This approach allows autospec to test new features immediately after
    implementation, not just check for regressions.
-   It requires no configuration, making it straightforward to use.

### Quick start

Generate and run 10 specs on TodoMVC, a classic example web app:

<!-- prettier-ignore -->
```
npx autospecai --url https://todomvc.com/examples/react/dist/ --apikey YOUR_OPENAI_API_KEY
```

You'll need to say "yes" to install the autospecai package, and the first run
may take a few minutes to download dependencies like browser binaries that are
used to execute the test environment.

When the run completes, you'll see a summary of the tests that were run and
whether they passed or failed.

The successful specs will be saved within the `trajectories` folder in your
working directory. You can re-execute these tests at any time by running:

<!-- prettier-ignore -->
```
npx playwright test
```

Depending on your existing Playwright setup, you may need to add "trajectories"
to the testDir in your playwright.config.js file.

### Using environment variables instead of passing keys as a flag

Copy the sample .env file, and fill in the OPENAI_API_KEY
or GOOGLE_GENERATIVE_AI_API_KEY before running the app:

<!-- prettier-ignore -->
```bash
mv .env.example .env # rename the example to .env
nano .env # edit as you like
```

### Learn more about configuration

<!-- prettier-ignore -->
```bash
> npx autospecai --help
    Usage: npx autospecai --url <url> [--model <model>] [--spec_limit <limit>] [--help | -h]

    Required:
    --url <url>          The target URL to run the autospec tests against.

    Optional:
    --help, -h           Show this help message.
    --spec_limit <limit> The max number of specs to generate. Default 10.
    --model <model>      The model to use for spec generation
                            * "gpt-4o" (default)
                            * "gemini-1.5-flash-latest"
                            * "claude-3-haiku"
                            * (note: Gemini flash is free up to rate limits)
    --apikey <key>       The relevant API key for the chosen model's API.
                            * If not specified, we'll fall back on the
                            following environment variables:
                            * OPENAI_API_KEY
                            * GOOGLE_GENERATIVE_AI_API_KEY
                            * ANTHROPIC_API_KEY

```

## Example output

Logs are printed to the console like so, as well as to a trajectories/\*\*
folder alongside a video, png and HTML/JSON DOM snapshots:

<!-- prettier-ignore -->
```
Test Summary:
✔ 1. Check if the page loads successfully
  1.1) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The page loaded successfully with all expected elements visible., planningThoughtAboutTheActionIWillTake: The page has loaded successfully as indicated by the presence of the header, input field, and footer. I will mark the spec as complete.
✔ 2. Check if the title 'todos' is displayed
  2.1) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The title 'todos' is displayed as an h1 element in the header section., planningThoughtAboutTheActionIWillTake: I will verify if the title 'todos' is displayed by checking the presence of the h1 element with the text 'todos'.
✔ 3. Check if the input box with placeholder 'What needs to be done?' is present
  3.1) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The input box with the placeholder 'What needs to be done?' is present in the HTML snapshot., planningThoughtAboutTheActionIWillTake: I will check if the input box with the placeholder 'What needs to be done?' is present in the HTML snapshot.
✔ 4. Check if a new todo item can be added
  4.1) action: clickOn, cssSelector: input.new-todo, nth: 0, planningThoughtAboutTheActionIWillTake: I will move the mouse cursor to the input field to add a new todo item.
  4.2) action: keyboardInputString, cssSelector: input.new-todo, nth: 0, string: Buy groceries, planningThoughtAboutTheActionIWillTake: I will type a new todo item into the input field.
  4.3) action: keyboardInputSingleKey, cssSelector: input.new-todo, nth: 0, key: Enter, planningThoughtAboutTheActionIWillTake: I will press the Enter key to add the new todo item.
  4.4) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The new todo item 'Buy groceries' was successfully added to the list., planningThoughtAboutTheActionIWillTake: I will mark the spec as complete because the new todo item 'Buy groceries' has been successfully added.
✔ 5. Check if a todo item can be marked as completed
  5.1) action: keyboardInputString, cssSelector: input.new-todo, nth: 0, string: Test Todo Item, planningThoughtAboutTheActionIWillTake: To check if a todo item can be marked as completed, I first need to add a new todo item. I will type a new todo item in the input field and press Enter.
  5.2) action: keyboardInputSingleKey, cssSelector: input.new-todo, nth: 0, key: Enter, planningThoughtAboutTheActionIWillTake: I need to press Enter to add the new todo item to the list.
  5.3) action: clickOn, cssSelector: input.toggle, nth: 0, planningThoughtAboutTheActionIWillTake: Now that the todo item is added, I will mark it as completed by clicking the checkbox next to the todo item.
  5.4) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The todo item was successfully marked as completed., planningThoughtAboutTheActionIWillTake: The todo item has been marked as completed, as indicated by the strikethrough text and the checkbox being checked. I will mark the spec as complete.
...
autospec passed for https://todomvc.com/examples/react/dist/
```

### Contributing

autospec is open-source and we welcome contributors! Please open an
[issue](https://github.com/zachblume/autospec/issues) or
[pull request](https://github.com/zachblume/autospec/pulls) to get started.

### Contributors

<a href="https://github.com/zachblume/autospec/graphs/contributors"><img src="https://contrib.rocks/image?repo=zachblume/autospec" /></a>

### License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.
