import playwright, { Browser, Frame, Page } from "playwright";

export async function initializeBrowser({
    testUrl,
    trajectoriesPath,
    runId,
    recordVideo = true,
    browser: browserPassedThrough,
}: {
    testUrl: string;
    trajectoriesPath: string;
    runId: string;
    recordVideo?: boolean;
    browser?: Browser;
}) {
    const browser =
        browserPassedThrough || (await playwright.chromium.launch());
    const context = await browser.newContext({
        viewport: { height: 1024, width: 1024 },
        screen: { height: 1024, width: 1024 },
        ...(recordVideo
            ? {
                  recordVideo: {
                      dir: `${trajectoriesPath}/${runId}`,
                      size: { width: 1024, height: 1024 },
                  },
              }
            : {}),
    });

    context.setDefaultTimeout(5000);
    const page = await context.newPage();

    preventBrowserFromNavigatingToOtherHosts({ page, testUrl });

    return { browser, context, page };
}

function preventBrowserFromNavigatingToOtherHosts({
    page,
    testUrl,
}: {
    page: Page;
    testUrl: string;
}) {
    const hostOfTestUrl = new URL(testUrl).host;
    page.on("framenavigated", (frame: Frame) => {
        const currentUrl = frame.url();
        if (currentUrl === "about:blank") return;
        try {
            const urlObject = new URL(currentUrl);
            if (urlObject.host !== hostOfTestUrl) {
                // Can't throw from event handler — use page.evaluate to stop
                // navigation and log the error. The next tool call will see
                // the page didn't navigate and can react accordingly.
                frame
                    .evaluate(() => window.stop())
                    .catch(() => {
                        /* frame may already be detached */
                    });
                console.error(
                    `Blocked navigation to ${currentUrl} (not on ${hostOfTestUrl})`,
                );
            }
        } catch {
            // Invalid URL in frame — ignore
        }
    });
}

export async function getAccessibilitySnapshot(page: Page): Promise<string> {
    return await page.locator("body").ariaSnapshot();
}

export async function saveScreenshot({
    page,
    path,
}: {
    page: Page;
    path: string;
}) {
    await page.screenshot({ path });
}
