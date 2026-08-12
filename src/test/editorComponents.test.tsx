import { describe, it, expect, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { TableToolbar } from "../editor/TableToolbar";
import { InlineAiCopilot } from "../editor/InlineAiCopilot";
import { CodeEditor } from "../editor/CodeEditor";
import type { EditorView } from "@milkdown/prose/view";

// Mock EditorView
function makeMockView(): EditorView {
  return {
    state: {
      selection: {
        from: 0,
        to: 0,
        $from: {
          depth: 1,
          node: () => ({ type: { name: "doc" } }),
          before: () => 0,
        },
      },
      doc: {
        textBetween: () => "mock selection text",
      },
      schema: {
        text: (str: string) => str,
      },
    },
    dom: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ top: 100, left: 100, width: 400, height: 200 }),
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView;
}

describe("Editor Components Rendering in JSDOM", () => {
  it("TableToolbar should render without throwing when visible is false", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    const mockView = makeMockView();

    expect(() => {
      root.render(<TableToolbar view={mockView} />);
    }).not.toThrow();

    root.unmount();
    document.body.removeChild(div);
  });

  it("InlineAiCopilot should render successfully when open", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    const mockView = makeMockView();

    expect(() => {
      root.render(
        <InlineAiCopilot
          view={mockView}
          open={true}
          onClose={() => {}}
          initialSelectedText="hello"
          position={{ x: 100, y: 100 }}
        />
      );
    }).not.toThrow();

    root.unmount();
    document.body.removeChild(div);
  });

  it("read-only CodeEditor should not expose an editable textbox", async () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    root.render(<CodeEditor content="const value = 1;" language="typescript" onChange={() => {}} readOnly />);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(div.querySelector("textarea")).toBeNull();

    root.unmount();
    document.body.removeChild(div);
  });
});
