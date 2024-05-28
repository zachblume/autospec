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

### Use the demonstration

```bash
# Copy the sample .env file, you'll need to fill in the OPENAI_API_KEY
# before running the app:
mv .env.example .env

# Use Node.js version specified in .nvmrc:
nvm use

# Install dependencies:
make

# Run the app with a target test URL:
URL="https://todomvc.com/examples/react/dist/" node index.js
```
