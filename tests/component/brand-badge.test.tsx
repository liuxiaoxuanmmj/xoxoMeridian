import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandBadge } from "@/components/layout/BrandBadge";

describe("BrandBadge", () => {
  it("renders the shared brand mark with a descriptive link name", () => {
    render(<BrandBadge href="/brand-destination" />);

    const brandLink = screen.getByRole("link", { name: "XOXO Meridian" });
    const brandMark = brandLink.querySelector("img");

    expect(brandLink).toHaveAttribute("href", "/brand-destination");
    expect(screen.getByText("XOXO")).toBeVisible();
    expect(screen.getByText("Meridian")).toBeVisible();
    expect(brandMark).toHaveAttribute("src", "/brand/logo_transparent.svg");
    expect(brandMark).toHaveAttribute("alt", "");
    expect(brandMark).toHaveAttribute("aria-hidden", "true");
    expect(brandMark).toHaveAttribute("width", "24");
    expect(brandMark).toHaveAttribute("height", "24");
    expect(brandLink).not.toHaveTextContent("🌿");
  });
});
