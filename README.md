# autospec

### Open source end-to-end (e2e) test generation for web apps

Traditional software testing is based on specifying behavior in code to test
for regressions. Users and QA testers, on the other hand, don't rely on formal
specifications to determine usability, but judgement.

autospec uses multi-modal LLMs to explore and test web apps, and uses judgement
on the full UI output after each interaction to decide whether to raise an
error.

-   This allows autospec to test new behavior immediately after implementation,
    instead of just testing for regressions.
-   This means autospec requires no configuration.

### Use the demonstration

```bash
# Copy the sample .env file, you'll need to fill in the OPENAI_API_KEY
# before running the app:
mv .env.example .env

# Use Node.js version specified in .nvmrc:
nvm use

# Install dependencies, boot the docker app we are testing (todomvc),
# and run the agent:
make
```

### Development

The main logic is currently in [index.js](index.js)
