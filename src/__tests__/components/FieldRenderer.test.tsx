import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldRenderer } from "@/components/FieldRenderer";

describe("FieldRenderer", () => {
  it("renders currency formatted value with default EUR", () => {
    render(<FieldRenderer value="2400" format="currency" />);
    expect(screen.getByText("\u20ac2 400")).toBeTruthy();
  });

  it("renders dash for null values", () => {
    render(<FieldRenderer value={null} format="text" />);
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("renders link as anchor tag", () => {
    const { container } = render(<FieldRenderer value="example.com" format="link" />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("example.com");
  });

  it("renders badge with styling", () => {
    const { container } = render(<FieldRenderer value="Active Customer" format="badge" />);
    const badge = container.querySelector("span");
    expect(badge?.textContent).toBe("Active Customer");
  });

  it("renders invoiceStatus with correct color for Overdue", () => {
    const { container } = render(<FieldRenderer value="Overdue" format="invoiceStatus" />);
    const el = container.querySelector("span");
    expect(el?.textContent).toBe("Overdue");
    expect(el?.className).toContain("text-[var(--rust)]");
  });

  it("renders invoiceStatus with correct color for Open", () => {
    const { container } = render(<FieldRenderer value="Open" format="invoiceStatus" />);
    const el = container.querySelector("span");
    expect(el?.className).toContain("text-orange");
  });

  it("renders invoiceStatus with correct color for Paid", () => {
    const { container } = render(<FieldRenderer value="Paid" format="invoiceStatus" />);
    const el = container.querySelector("span");
    expect(el?.className).toContain("text-[var(--moss)]");
  });
});
