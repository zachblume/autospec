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

### Get started

1. Copy the sample .env file, you'll need to fill in the OPENAI_API_KEY
   or GOOGLE_GENERATIVE_AI_API_KEY before running the app:

```bash
mv .env.example .env
```

2. Install dependencies:

```
npm install
```

3. Generate and run 10 specs on TodoMVC, a classic example web app:

```
npx autospec --url https://todomvc.com/examples/react/dist/ --model gpt-4o --spec-limit 10
```

### Learn more about configuration

```
npx autospec --help
Usage: npx autospec --url <url> [--model <model>] [--spec_limit <limit>] [--help | -h]

Required:
--url <url> The target URL to run the autospec tests against.

Optional:
--help, -h Show this help message.
--spec*limit <limit> The max number of specs to generate. Default 10.
--model <model> The model to use for spec generation
* "gpt-4o" (default)
* "gemini-1.5-flash-latest"
* "claude-3-haiku"
* (note: Gemini flash is free up to rate limits)

```

## Example output

Logs are printed to the console like so, as well as to a trajectories/\*\*
folder alongside a video, png and HTML/JSON DOM snapshots:

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
✔ 6. Check if a todo item can be edited
6.1) action: keyboardInputString, cssSelector: input.new-todo, nth: 0, string: Test Todo Item, planningThoughtAboutTheActionIWillTake: To check if a todo item can be edited, I first need to add a todo item. I will type a todo item in the input field and press Enter.
6.2) action: keyboardInputSingleKey, cssSelector: input.new-todo, nth: 0, key: Enter, planningThoughtAboutTheActionIWillTake: I need to press Enter to add the todo item to the list.
6.3) action: doubleClickOn, cssSelector: ul.todo-list li div.view label, nth: 0, planningThoughtAboutTheActionIWillTake: To edit the todo item, I need to double-click on the todo item label.
6.4) action: keyboardInputString, cssSelector: ul.todo-list li div.input-container input.new-todo, nth: 0, string: Edited Todo Item, planningThoughtAboutTheActionIWillTake: Now that the todo item is in edit mode, I will change the text of the todo item.
6.5) action: keyboardInputSingleKey, cssSelector: ul.todo-list li div.input-container input.new-todo, nth: 0, key: Enter, planningThoughtAboutTheActionIWillTake: To save the edited todo item, I need to press Enter.
6.6) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The todo item was successfully edited and saved as 'Edited Todo Item'., planningThoughtAboutTheActionIWillTake: The todo item has been successfully edited and saved. I will mark the spec as complete.
✔ 7. Check if a todo item can be deleted
7.1) action: keyboardInputString, cssSelector: input.new-todo, nth: 0, string: Test Todo Item, planningThoughtAboutTheActionIWillTake: To check if a todo item can be deleted, I first need to add a todo item. I will type a todo item in the input field and press Enter.
7.2) action: keyboardInputSingleKey, cssSelector: input.new-todo, nth: 0, key: Enter, planningThoughtAboutTheActionIWillTake: I need to press Enter to add the todo item to the list.
7.3) action: clickOn, cssSelector: button.destroy, nth: 0, planningThoughtAboutTheActionIWillTake: Now that the todo item is added, I need to click on the delete button (the button with class 'destroy') to delete the todo item.
7.4) action: hoverOver, cssSelector: li[data-testid='todo-item'], nth: 0, planningThoughtAboutTheActionIWillTake: The delete button is not visible. I need to hover over the todo item to make the delete button visible.
7.5) action: clickOn, cssSelector: button.destroy, nth: 0, planningThoughtAboutTheActionIWillTake: Now that the delete button is visible, I will click on the delete button to delete the todo item.
7.6) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The todo item was successfully deleted and is no longer visible on the page., planningThoughtAboutTheActionIWillTake: The todo item has been successfully deleted as it is no longer visible on the page.
✔ 8. Check if the footer text 'Double-click to edit a todo' is displayed
8.1) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The footer text 'Double-click to edit a todo' is displayed in the HTML snapshot., planningThoughtAboutTheActionIWillTake: I will check if the footer text 'Double-click to edit a todo' is displayed by examining the HTML snapshot.
✔ 9. Check if the footer text 'Created by the TodoMVC Team' is displayed
9.1) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The footer text 'Created by the TodoMVC Team' is displayed as expected., planningThoughtAboutTheActionIWillTake: I will mark the spec as complete because the footer text 'Created by the TodoMVC Team' is displayed in the screenshot and confirmed in the HTML snapshot.
✔ 10. Check if the footer text 'Part of TodoMVC' is displayed
10.1) action: markSpecAsComplete, reason: The spec passed, fullProseExplanationOfReasoning100charmax: The footer text 'Part of TodoMVC' is displayed in the HTML snapshot., planningThoughtAboutTheActionIWillTake: I will check the HTML snapshot to see if the footer text 'Part of TodoMVC' is present.
autospec passed for https://todomvc.com/examples/react/dist/

```
