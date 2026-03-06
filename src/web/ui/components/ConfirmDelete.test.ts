import { test, expect } from "bun:test";
import React from "react";
import { mount, click, queryAll } from "../test-helpers";
import { ConfirmDelete } from "./ConfirmDelete";

test("ConfirmDelete shows initial delete button", () => {
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => {} }),
  );
  const btn = container.querySelector("button")!;
  expect(btn.textContent).toContain("Delete");
  unmount();
});

test("ConfirmDelete uses custom buttonLabel", () => {
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => {}, buttonLabel: "Remove" }),
  );
  const btn = container.querySelector("button")!;
  expect(btn.textContent).toContain("Remove");
  unmount();
});

test("ConfirmDelete shows confirmation after first click", () => {
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => {} }),
  );
  click(container.querySelector("button")!);
  const buttons = queryAll(container, "button");
  expect(buttons.length).toBe(2);
  expect(buttons[0]!.textContent).toContain("Confirm");
  expect(buttons[1]!.textContent).toContain("Cancel");
  unmount();
});

test("ConfirmDelete shows custom confirmLabel", () => {
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => {}, confirmLabel: "Really?" }),
  );
  click(container.querySelector("button")!);
  expect(container.textContent).toContain("Really?");
  unmount();
});

test("ConfirmDelete calls onConfirm when Confirm clicked", () => {
  let confirmed = false;
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => { confirmed = true; } }),
  );
  click(container.querySelector("button")!);
  const buttons = queryAll(container, "button");
  click(buttons[0]!); // Confirm
  expect(confirmed).toBe(true);
  unmount();
});

test("ConfirmDelete returns to initial state after Cancel", () => {
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => {} }),
  );
  click(container.querySelector("button")!);
  const buttons = queryAll(container, "button");
  click(buttons[1]!); // Cancel
  const btns = queryAll(container, "button");
  expect(btns.length).toBe(1);
  expect(btns[0]!.textContent).toContain("Delete");
  unmount();
});

test("ConfirmDelete does not call onConfirm on Cancel", () => {
  let confirmed = false;
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => { confirmed = true; } }),
  );
  click(container.querySelector("button")!);
  const buttons = queryAll(container, "button");
  click(buttons[1]!); // Cancel
  expect(confirmed).toBe(false);
  unmount();
});

test("ConfirmDelete returns to initial state after Confirm", () => {
  const { container, unmount } = mount(
    React.createElement(ConfirmDelete, { onConfirm: () => {} }),
  );
  click(container.querySelector("button")!);
  const buttons = queryAll(container, "button");
  click(buttons[0]!); // Confirm
  const btns = queryAll(container, "button");
  expect(btns.length).toBe(1);
  expect(btns[0]!.textContent).toContain("Delete");
  unmount();
});
