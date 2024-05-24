# Reality Check

### Open source end-to-end (e2e) test generator for web apps

Traditional software testing is based on specifying behavior in code to test
for regressions. Users and QA testers, on the other hand, don't rely on formal
specifications to determine usability, but judgement.

Reality Check uses multi-modal LLMs to explore and test web apps, and uses
judgement on the full UI output after each interaction to decide whether to
raise an error.

-   This allows RC to test _new_ behavior immediately after implementation, instead of just testing for regressions.
-   This means RC requires no configuration.

### Development

```bash
nvm use # Use Node.js version specified in .nvmrc
npm install # Install dependencies
make # Boot the docker app we are testing (todomvc) and run the agent
```