import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonPhoto, type AboutViewPerson } from "@/components/about/AboutView";

function person(photo: AboutViewPerson["photo"]): AboutViewPerson {
  return {
    id: "oo",
    name: "oo",
    eyebrow: "soft signal",
    title: "Collecting small pieces of today",
    body: [
      "oo keeps the quiet parts of the day close: a line from a book, a photo before sleep.",
      "In this space, oo feels like the gentle signal that turns ordinary moments into something worth saving.",
    ],
    layout: "photo-left",
    rotation: -4,
    photo,
  };
}

describe("About 照片交付状态", () => {
  beforeEach(() => {
    // framer-motion 的入场动画依赖 IntersectionObserver；进入视口后即可断言可见结果。
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private readonly onIntersect: IntersectionObserverCallback) {}
        observe(target: Element) {
          this.onIntersect(
            [{ target, isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("已交付照片渲染为指向交付路径且带可访问描述的图片", async () => {
    render(<PersonPhoto person={person({ src: "/images/about/oo.jpg", alt: "Portrait of oo" })} />);

    const portrait = await screen.findByRole("img", { name: "Portrait of oo" });
    expect(portrait.tagName).toBe("IMG");
    expect(portrait.getAttribute("src")).toContain("oo.jpg");
    await waitFor(() => expect(portrait).toBeVisible());
    expect(screen.queryByText("photo coming soon")).toBeNull();
  });

  it("照片缺失时显示回退、保留同一可访问描述且不引用缺失路径", async () => {
    render(<PersonPhoto person={person({ src: null, alt: "Portrait of oo" })} />);

    const portrait = await screen.findByRole("img", { name: "Portrait of oo" });
    expect(portrait).toHaveTextContent("photo coming soon");
    await waitFor(() => expect(portrait).toBeVisible());
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });
});
