import { test, expect } from "@playwright/test";

test.describe("Session Cost Detail UI Refinement", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Cost Overview page
    // Note: Adjust URL based on your routing
    await page.goto("/#cost-overview"); 
  });

  test("should display the 80/20 layout when a session is expanded", async ({ page }) => {
    // 1. Locate a session row in the cost detail table
    const firstRow = page.locator("tbody tr").first();
    await firstRow.click(); // Expand the row

    // 2. Check the Diagnostic Panel container
    const diagnosticPanel = page.locator("td[colspan='7']");
    await expect(diagnosticPanel).toBeVisible();

    // 3. Verify the 80/20 grid layout
    const leftPart = diagnosticPanel.locator("div.lg\\:w-4\\/5");
    const rightPart = diagnosticPanel.locator("div.lg\\:w-1\\/5");

    await expect(leftPart).toBeVisible();
    await expect(rightPart).toBeVisible();

    // 4. Verify vertical centering (lg:items-center)
    const contentArea = diagnosticPanel.locator("div.flex.flex-col.gap-6.lg\\:flex-row.lg\\:items-center");
    await expect(contentArea).toBeVisible();
  });

  test("should have the unified background color for expanded rows", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();

    // The header row should have the expanded background
    await expect(firstRow).toHaveClass(/bg-primary-soft\/40/);

    // The detail cell should have the same background
    const detailCell = page.locator("td[colspan='7']");
    await expect(detailCell).toHaveClass(/bg-primary-soft\/40/);
  });

  test("should only show 'View Execution Trace' button and not OTel tracing", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();

    const actionArea = page.locator("div.lg\\:w-1\\/5");
    
    // Verify "查看执行流水" (or whatever localized text) is present
    // We check for the presence of the button and its icon/text structure
    const viewTraceBtn = actionArea.locator("button:has-text('查看执行流水')");
    await expect(viewTraceBtn).toBeVisible();

    // Verify "追踪 OTel 链路" is REMOVED
    const otelBtn = actionArea.locator("button:has-text('追踪 OTel 链路')");
    await expect(otelBtn).not.toBeVisible();
  });

  test("should show the action button centered horizontally in the 20% area", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    await firstRow.click();

    const rightPart = page.locator("div.lg\\:w-1\\/5");
    await expect(rightPart).toHaveClass(/items-center/);
    
    const btnContainer = rightPart.locator("div.flex.w-full.flex-col.items-center");
    await expect(btnContainer).toBeVisible();
  });
});
