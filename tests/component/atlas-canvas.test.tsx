import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AtlasCanvas } from "@/components/atlas/AtlasCanvas";

const baseProps = {
  elements: [],
  connections: [],
  onElementDragStart: vi.fn(),
  onElementDrag: vi.fn(),
  onElementDragEnd: vi.fn(),
  onElementUpdate: vi.fn(),
  onElementDelete: vi.fn(),
  onElementClick: vi.fn(),
  onConnectionDelete: vi.fn(),
  getNextZIndex: vi.fn(() => 1),
  connectMode: false,
  connectFrom: null,
};

describe("AtlasCanvas", () => {
  const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
  });

  it("pans from the latest viewport and calls the latest change handler", () => {
    const firstChange = vi.fn();
    const secondChange = vi.fn();
    const { container, rerender } = render(
      <AtlasCanvas
        {...baseProps}
        viewport={{ x: 10, y: 20, zoom: 1 }}
        onViewportChange={firstChange}
      />
    );
    const canvas = container.firstElementChild as HTMLElement;

    rerender(
      <AtlasCanvas
        {...baseProps}
        viewport={{ x: 100, y: 200, zoom: 2 }}
        onViewportChange={secondChange}
      />
    );

    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 35, clientY: 55, pointerId: 1 });

    expect(firstChange).not.toHaveBeenCalled();
    expect(secondChange).toHaveBeenCalledWith({ x: 115, y: 225, zoom: 2 });
  });
});
