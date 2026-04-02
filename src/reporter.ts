import fs from "fs";
import chalk from "chalk";
import type { TestResult, ActionRecord } from "./schemas.js";

export function printTestResults({
    testResults,
}: {
    testResults: TestResult[];
}) {
    console.log("\n" + chalk.bold("Test Summary:"));

    testResults.forEach((result, index) => {
        const icon =
            result.status === "passed" ? chalk.green("✔") : chalk.red("✘");
        console.log(`${icon} ${index + 1}. ${result.spec}`);
        if (result.reason) {
            console.log(chalk.dim(`     ${result.reason}`));
        }
        result.actions.forEach((action, innerIndex) => {
            const args = Object.entries(action.args)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ");
            console.log(
                chalk.dim(`  ${index + 1}.${innerIndex + 1}) ${action.tool}(${args})`),
            );
        });
    });

    const passed = testResults.filter((r) => r.status === "passed").length;
    const failed = testResults.filter((r) => r.status === "failed").length;
    console.log(
        `\n${chalk.green(`${passed} passed`)}, ${chalk.red(`${failed} failed`)}, ${testResults.length} total\n`,
    );
}

export function writePlaywrightSpecFile({
    runId,
    testUrl,
    testResults,
    trajectoriesPath,
}: {
    runId: string;
    testUrl: string;
    testResults: TestResult[];
    trajectoriesPath: string;
}) {
    const successfulTests = testResults.filter(
        (result) => result.status === "passed",
    );
    if (successfulTests.length === 0) return;

    const testFilePath = `${trajectoriesPath}/${runId}/successfulTests-${runId}.spec.js`;

    let fileContent = `import { test, expect } from '@playwright/test';\n\n`;
    fileContent += `test.beforeEach(async ({ page }) => {\n`;
    fileContent += `  await page.goto('${esc(testUrl)}');\n`;
    fileContent += `});\n\n`;

    for (const { spec, actions } of successfulTests) {
        const escapedSpec = spec.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        fileContent += `test("${escapedSpec}", async ({ page }) => {\n`;

        for (const action of actions) {
            const line = actionToPlaywright(action);
            if (line) {
                fileContent += `  ${line}\n`;
            }
        }

        fileContent += `});\n\n`;
    }

    fs.mkdirSync(`${trajectoriesPath}/${runId}`, { recursive: true });
    fs.writeFileSync(testFilePath, fileContent, "utf-8");
    console.log(chalk.dim(`Specs written to ${testFilePath}`));
}

function esc(s: unknown): string {
    return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function actionToPlaywright(action: ActionRecord): string | null {
    const { tool: toolName, args } = action;
    const a = args as Record<string, string | number | boolean>;

    switch (toolName) {
        case "click":
            return `await page.getByRole('${esc(a.role)}', { name: '${esc(a.name)}' }).click();`;
        case "fill":
            return `await page.getByLabel('${esc(a.label)}').fill('${esc(a.value)}');`;
        case "press_key":
            return `await page.keyboard.press('${esc(a.key)}');`;
        case "hover":
            return `await page.getByRole('${esc(a.role)}', { name: '${esc(a.name)}' }).hover();`;
        case "scroll":
            return `await page.mouse.wheel(${a.deltaX}, ${a.deltaY});`;
        case "navigate":
            return `await page.goto('${esc(a.url)}');`;
        case "wait":
            return `await page.waitForTimeout(${a.milliseconds});`;
        case "get_by_text":
            return `await page.getByText('${esc(a.text)}'${a.exact ? ", { exact: true }" : ""}).click();`;
        case "mark_complete":
            return null;
        default:
            return `// Unknown action: ${toolName}`;
    }
}
